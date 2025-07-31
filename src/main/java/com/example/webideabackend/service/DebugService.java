/**
 * DebugService.java
 *
 * This is the core service for debugging. It uses the Java Debug Interface (JDI)
 * to launch, connect to, and control a debuggee Java process. It now maintains
 * the context of the currently active project for a debug session.
 */
package com.example.webideabackend.service;

import com.example.webideabackend.model.Breakpoint;
import com.example.webideabackend.model.DebugEvent;
import com.example.webideabackend.model.debug.LocationInfo;
import com.example.webideabackend.model.debug.PausedEventData;
import com.example.webideabackend.model.debug.StackFrameInfo;
import com.example.webideabackend.model.debug.VariableInfo;
import com.sun.jdi.*;
import com.sun.jdi.connect.AttachingConnector;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.IllegalConnectorArgumentsException;
import com.sun.jdi.event.*;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.StepRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@Slf4j
public class DebugService implements DisposableBean {

    private final JavaCompilerRunnerService runnerService;
    private final WebSocketLogService webSocketLogService;
    private final Path workspaceRoot;

    private volatile VirtualMachine vm;
    private volatile Process debuggeeProcess;
    private volatile Thread eventThread;
    private final Map<String, List<BreakpointRequest>> activeBreakpoints = new ConcurrentHashMap<>();

    private volatile ThreadReference pausedThread = null;

    // 关键修改: 记住当前正在调试的项目，以确保路径解析正确。
    private volatile String currentDebugProjectPath = null;

    private static final String DEBUG_TOPIC = "/topic/debug-events";

    @Autowired
    public DebugService(JavaCompilerRunnerService runnerService, WebSocketLogService webSocketLogService, @Value("${app.workspace-root}") String workspaceRootPath) {
        this.runnerService = runnerService;
        this.webSocketLogService = webSocketLogService;
        this.workspaceRoot = Paths.get(workspaceRootPath);
    }

    public synchronized void startDebugSession(String projectPath, String mainClass) throws IOException, IllegalConnectorArgumentsException {
        if (vm != null && vm.process() != null && vm.process().isAlive()) {
            throw new IllegalStateException("A debug session is already active.");
        }
        cleanupSession();

        // 关键修改: 在会话开始时保存项目上下文。
        this.currentDebugProjectPath = projectPath;

        JavaCompilerRunnerService.DebugLaunchResult launchResult = runnerService.launchForDebug(projectPath, mainClass);
        this.debuggeeProcess = launchResult.process();

        AttachingConnector connector = Bootstrap.virtualMachineManager().attachingConnectors().stream()
                .filter(c -> c.transport().name().equals("dt_socket"))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("JDI socket attaching connector not found"));

        Map<String, Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("port").setValue(String.valueOf(launchResult.port()));
        arguments.get("hostname").setValue("127.0.0.1");

        this.vm = connector.attach(arguments);
        log.info("Successfully attached to debuggee VM on port {}", launchResult.port());

        this.eventThread = new Thread(this::eventProcessingLoop, "jdi-event-thread");
        this.eventThread.start();

        webSocketLogService.sendMessage(DEBUG_TOPIC, DebugEvent.started());
        vm.resume();
    }

    private void eventProcessingLoop() {
        if (vm == null) return;
        EventQueue eventQueue = vm.eventQueue();
        try {
            while (!Thread.currentThread().isInterrupted()) {
                EventSet eventSet = eventQueue.remove();
                for (Event event : eventSet) {
                    if (event instanceof VMDisconnectEvent) {
                        log.info("Debuggee VM disconnected.");
                        cleanupSession();
                        return;
                    } else if (event instanceof BreakpointEvent) {
                        handlePausedEvent((BreakpointEvent) event);
                    } else if (event instanceof StepEvent) {
                        handlePausedEvent((StepEvent) event);
                    } else {
                        eventSet.resume();
                    }
                }
            }
        } catch (InterruptedException e) {
            log.info("JDI event thread interrupted.");
            Thread.currentThread().interrupt();
        } catch (VMDisconnectedException e) {
            log.info("VM disconnected while waiting for an event.");
            cleanupSession();
        }
    }

    private void handlePausedEvent(LocatableEvent event) {
        try {
            ThreadReference thread = event.thread();
            this.pausedThread = thread;

            Location location = event.location();
            LocationInfo locInfo = extractLocationInfo(location);
            List<StackFrameInfo> callStack = extractCallStack(thread);
            List<VariableInfo> variables = extractVariables(thread.frame(0));

            PausedEventData pausedData = new PausedEventData(locInfo, variables, callStack);
            webSocketLogService.sendMessage(DEBUG_TOPIC, DebugEvent.paused(pausedData));

        } catch (Exception e) {
            log.error("Error handling paused event", e);
            if (vm != null) vm.resume();
        }
    }

    // --- Data Extraction Helpers ---
    private LocationInfo extractLocationInfo(Location loc) throws AbsentInformationException {
        // 关键修改: 使用当前调试的项目路径来计算相对路径，确保前端能正确定位文件。
        if (currentDebugProjectPath == null) {
            log.warn("Cannot determine relative path, debug project context is not set. Falling back to absolute path.");
            return new LocationInfo(loc.sourcePath(), loc.sourceName(), loc.lineNumber());
        }
        Path projectDir = workspaceRoot.resolve(currentDebugProjectPath);
        // JDI 可能返回一个绝对路径，我们需要将其转换为相对于当前项目根目录的路径
        String relativePath = projectDir.relativize(Paths.get(loc.sourcePath())).toString().replace('\\', '/');
        return new LocationInfo(relativePath, loc.sourceName(), loc.lineNumber());
    }

    private List<StackFrameInfo> extractCallStack(ThreadReference thread) {
        try {
            return thread.frames().stream().map(frame -> {
                try {
                    Location loc = frame.location();
                    return new StackFrameInfo(loc.method().name(), loc.sourceName(), loc.lineNumber());
                } catch (AbsentInformationException e) {
                    return new StackFrameInfo(frame.location().method().name(), "Unknown Source", -1);
                }
            }).collect(Collectors.toList());
        } catch (IncompatibleThreadStateException e) {
            log.warn("Could not extract call stack due to thread state.", e);
            return new ArrayList<>();
        }
    }

    private List<VariableInfo> extractVariables(StackFrame frame) {
        try {
            return frame.visibleVariables().stream()
                    .map(variable -> {
                        try {
                            com.sun.jdi.Value value = frame.getValue(variable);
                            String valueStr = (value == null) ? "null" : value.toString();
                            if (value instanceof StringReference) {
                                valueStr = "\"" + ((StringReference) value).value() + "\"";
                            }
                            return new VariableInfo(variable.name(), variable.typeName(), valueStr);
                        } catch (Exception e) {
                            log.warn("Could not get value for variable {} due to thread state", variable.name());
                            return new VariableInfo(variable.name(), variable.typeName(), "<Not Available>");
                        }
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.error("Could not retrieve variables from stack frame.", e);
            return new ArrayList<>();
        }
    }

    // --- Debug Control Methods ---
    public void resume() {
        if (vm != null) {
            this.pausedThread = null;
            vm.resume();
            webSocketLogService.sendMessage(DEBUG_TOPIC, DebugEvent.resumed());
        }
    }

    private void executeStep(int depth) {
        if (pausedThread == null) {
            throw new IllegalStateException("Cannot step when the debugger is not paused.");
        }
        vm.eventRequestManager().deleteEventRequests(vm.eventRequestManager().stepRequests());
        StepRequest request = vm.eventRequestManager().createStepRequest(pausedThread, StepRequest.STEP_LINE, depth);
        request.addCountFilter(1);
        request.enable();
        resume();
    }

    public void stepOver() {
        executeStep(StepRequest.STEP_OVER);
    }

    public void stepInto() {
        executeStep(StepRequest.STEP_INTO);
    }

    public void stepOut() {
        executeStep(StepRequest.STEP_OUT);
    }

    public void toggleBreakpoint(Breakpoint bp) {
        if (vm == null) throw new IllegalStateException("Debug session not active.");

        // 关键修改: 验证断点请求的项目是否与当前调试的项目匹配。
        if (!Objects.equals(this.currentDebugProjectPath, bp.projectPath())) {
            throw new IllegalStateException(
                    String.format("Breakpoint request for project '%s' does not match active debug session for project '%s'.",
                            bp.projectPath(), this.currentDebugProjectPath)
            );
        }

        String className = bp.filePath()
                .replaceFirst("^src/main/java/", "")
                .replace(".java", "")
                .replace('/', '.');
        List<ReferenceType> classes = vm.classesByName(className);
        if (classes.isEmpty()) {
            log.warn("Cannot find class for breakpoint: {} (tried class name: {})", bp.filePath(), className);
            return;
        }

        ReferenceType refType = classes.get(0);
        List<Location> locations;
        try {
            locations = refType.locationsOfLine(bp.lineNumber());
        } catch (AbsentInformationException e) {
            log.error("No line number information for class {}", refType.name());
            return;
        }

        if (locations.isEmpty()) {
            log.warn("No code found at line {} in {}", bp.lineNumber(), bp.filePath());
            return;
        }

        Location location = locations.get(0);
        String locationStr = location.toString();

        List<BreakpointRequest> existingRequests = activeBreakpoints.getOrDefault(locationStr, new ArrayList<>());

        if (bp.enabled()) {
            if (existingRequests.isEmpty()) {
                BreakpointRequest request = vm.eventRequestManager().createBreakpointRequest(location);
                request.enable();
                existingRequests.add(request);
                activeBreakpoints.put(locationStr, existingRequests);
                log.info("Breakpoint set at: {}", locationStr);
            }
        } else {
            if (!existingRequests.isEmpty()) {
                vm.eventRequestManager().deleteEventRequests(existingRequests);
                activeBreakpoints.remove(locationStr);
                log.info("Breakpoint removed from: {}", locationStr);
            }
        }
    }

    public void cleanupSession() {
        if (vm != null) {
            try {
                if (vm.process() != null && vm.process().isAlive()) {
                    vm.exit(0);
                }
            } catch (Exception e) { /* Ignore */ }
            vm = null;
        }
        if (debuggeeProcess != null && debuggeeProcess.isAlive()) {
            debuggeeProcess.destroyForcibly();
            debuggeeProcess = null;
        }
        if (eventThread != null && eventThread.isAlive()) {
            eventThread.interrupt();
            eventThread = null;
        }
        activeBreakpoints.clear();
        pausedThread = null;
        // 关键修改: 清理会话时，重置项目上下文。
        currentDebugProjectPath = null;
        webSocketLogService.sendMessage(DEBUG_TOPIC, DebugEvent.terminated());
        log.info("Debug session cleaned up.");
    }

    @Override
    public void destroy() {
        cleanupSession();
    }
}