package com.example.webideabackend.service;

import com.example.webideabackend.model.debug.*;
import com.example.webideabackend.util.MavenProjectHelper;
import com.sun.jdi.*;
import com.sun.jdi.connect.AttachingConnector;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.IllegalConnectorArgumentsException;
import com.sun.jdi.event.*;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.StepRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class DebugService {

    private static final Logger logger = LoggerFactory.getLogger(DebugService.class);
    private static final int JDWP_PORT = 5005;

    private final WebSocketNotificationService webSocketService;
    private final MavenProjectHelper mavenHelper;
    private final SettingsService settingsService; // 新增 SettingsService 依赖

    @Value("#{${app.jdk.paths}}")
    private Map<String, String> jdkPaths;

    private final AtomicReference<VirtualMachine> vm = new AtomicReference<>();
    private final AtomicReference<Process> process = new AtomicReference<>();
    private final Map<String, List<BreakpointRequest>> userBreakpoints = new ConcurrentHashMap<>();

    private Thread eventThread;

    // ========================= 关键修改 START: 移除 @Value 注入并添加 SettingsService =========================
    public DebugService(WebSocketNotificationService webSocketService,
                        MavenProjectHelper mavenHelper,
                        SettingsService settingsService) {
        // 移除了 @Value("${app.workspace-root}") String workspaceRoot 参数
        this.webSocketService = webSocketService;
        this.mavenHelper = mavenHelper;
        this.settingsService = settingsService;
    }

    /**
     * 动态获取最新的工作区根目录。
     * @return 当前配置的工作区根目录的 Path 对象。
     */
    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        if (workspaceRootPath == null || workspaceRootPath.isBlank()) {
            workspaceRootPath = "./workspace"; // 安全回退
        }
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }
    // ========================= 关键修改 END =======================================================


    public synchronized void startDebug(String projectPath, String mainClass) {
        logger.info("请求启动调试会话，项目: {}, 主类: {}", projectPath, mainClass);

        if (isDebugging()) {
            logger.warn("检测到活动的调试会话，将先进行清理...");
            cleanup();
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        try {
            launchDebugeeProcess(projectPath, mainClass)
                    .thenAccept(newProcess -> {
                        this.process.set(newProcess);
                        logger.info("被调试进程已启动并准备好附加，PID: {}", newProcess.pid());
                        try {
                            VirtualMachine newVm = attachToVm();
                            this.vm.set(newVm);
                            logger.info("已成功附加到 VM: {}", newVm.description());

                            ClassPrepareRequest cpr = newVm.eventRequestManager().createClassPrepareRequest();
                            cpr.addClassFilter("*");
                            cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                            cpr.enable();

                            configureAndStartEventHandling(newVm);
                            webSocketService.sendDebugEvent(new WsDebugEvent<>("STARTED", null));
                            newVm.resume();
                            logger.info("调试会话已完全启动并恢复运行。");

                        } catch (Exception e) {
                            logger.error("附加到VM或启动事件处理时失败: {}", e.getMessage(), e);
                            cleanup();
                        }
                    })
                    .exceptionally(ex -> {
                        logger.error("启动被调试进程失败: {}", ex.getMessage(), ex.getCause());
                        cleanup();
                        return null;
                    });
        } catch (IOException e) {
            logger.error("创建被调试进程时发生 I/O 错误: {}", e.getMessage(), e);
            cleanup();
        }
    }

    private CompletableFuture<Process> launchDebugeeProcess(String projectPath, String mainClass) throws IOException {
        runMavenCompile(projectPath);

        // 使用动态路径获取
        String jdkVersion = mavenHelper.getJavaVersionFromPom(getWorkspaceRoot().resolve(projectPath).toFile(), null);
        String jdkPathKey = "jdk" + jdkVersion;
        String javaExecutable = jdkPaths.get(jdkPathKey);
        if (javaExecutable == null || !new File(javaExecutable).exists()) {
            logger.warn("未找到为项目配置的JDK'{}'，将回退到系统默认'java'。", jdkPathKey);
            javaExecutable = "java";
        }

        // 使用动态路径获取
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        Path classesDir = projectDir.resolve("target/classes");
        if (!Files.exists(classesDir)) {
            throw new IOException("编译产物目录 'target/classes' 不存在。请检查编译是否成功。");
        }

        String jdwpConfig = String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=%d", JDWP_PORT);

        List<String> command = new ArrayList<>();
        command.add(javaExecutable);
        command.add(jdwpConfig);
        command.add("-cp");
        command.add(classesDir.toAbsolutePath().toString());
        command.add(mainClass);

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(projectDir.toFile());
        logger.info("执行调试命令: {}", String.join(" ", pb.command()));

        Process p = pb.start();
        CompletableFuture<Process> processReadyFuture = new CompletableFuture<>();
        redirectStream(p, p.getInputStream(), "INFO", processReadyFuture);
        redirectStream(p, p.getErrorStream(), "ERROR", processReadyFuture);

        return processReadyFuture.orTimeout(90, TimeUnit.SECONDS);
    }

    private void runMavenCompile(String projectPath) throws IOException {
        // 使用动态路径获取
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        String mvnCommand = System.getProperty("os.name").toLowerCase().contains("win") ? "mvn.cmd" : "mvn";
        ProcessBuilder pb = new ProcessBuilder(mvnCommand, "compile");
        pb.directory(projectDir.toFile());
        pb.redirectErrorStream(true);

        logger.info("正在为调试执行编译: {} compile", mvnCommand);
        Process compileProcess = pb.start();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(compileProcess.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                webSocketService.sendBuildLog("[编译] " + line);
            }
        }

        try {
            int exitCode = compileProcess.waitFor();
            if (exitCode != 0) {
                throw new IOException("Maven 编译失败，退出码: " + exitCode);
            }
            logger.info("编译成功。");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("编译过程被中断。", e);
        }
    }

    // ... (剩余代码保持不变) ...

    private void redirectStream(Process p, InputStream inputStream, String prefix, CompletableFuture<Process> readyFuture) {
        new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    webSocketService.sendRunLog(String.format("[%s] %s", prefix, line));
                    if (!readyFuture.isDone() && line.contains("Listening for transport dt_socket")) {
                        logger.info("检测到JDWP监听日志，准备附加调试器...");
                        readyFuture.complete(p);
                    }
                }
            } catch (IOException e) {
                logger.warn("读取进程流时出错 (可能是进程已结束): {}", e.getMessage());
            }

            if (!readyFuture.isDone()) {
                logger.error("进程流已结束，但未检测到JDWP监听日志，启动失败。");
                readyFuture.completeExceptionally(new IOException("进程意外终止，未能启动调试模式。请检查日志输出以获取详细错误。"));
            }
        }).start();
    }

    private VirtualMachine attachToVm() throws IOException, IllegalConnectorArgumentsException {
        VirtualMachineManager vmm = Bootstrap.virtualMachineManager();
        AttachingConnector connector = vmm.attachingConnectors().stream()
                .filter(c -> c.transport().name().equals("dt_socket"))
                .findFirst()
                .orElseThrow(() -> new IOException("找不到 dt_socket attaching connector"));

        Map<String, Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("port").setValue(String.valueOf(JDWP_PORT));
        arguments.get("hostname").setValue("localhost");
        arguments.get("timeout").setValue("10000");

        return connector.attach(arguments);
    }

    public void stopDebug() {
        logger.info("收到手动停止调试请求...");
        cleanup();
        webSocketService.sendDebugEvent(new WsDebugEvent<>("TERMINATED", null));
    }

    public void toggleBreakpoint(String filePath, int lineNumber, boolean enabled) {
        List<BreakpointRequest> fileBreakpoints = userBreakpoints.computeIfAbsent(filePath, k -> new ArrayList<>());
        fileBreakpoints.removeIf(bp -> bp.getLineNumber() == lineNumber);
        if (enabled) {
            BreakpointRequest bpDto = new BreakpointRequest();
            bpDto.setFilePath(filePath);
            bpDto.setLineNumber(lineNumber);
            bpDto.setEnabled(true);
            fileBreakpoints.add(bpDto);
        }
        VirtualMachine currentVm = vm.get();
        if (currentVm != null) {
            applyBreakpointChange(currentVm, filePath, lineNumber, enabled);
        }
    }

    private synchronized void cleanup() {
        logger.info("开始清理调试会话...");
        if (eventThread != null && eventThread.isAlive()) {
            eventThread.interrupt();
            try { eventThread.join(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            logger.info("调试事件线程已中断。");
            eventThread = null;
        }
        VirtualMachine currentVm = vm.getAndSet(null);
        if (currentVm != null) {
            try {
                if (currentVm.process() != null) {
                    currentVm.eventRequestManager().deleteAllBreakpoints();
                    currentVm.dispose();
                    logger.info("VM 连接已释放 (dispose)。");
                }
            } catch (VMDisconnectedException ignored) {
                logger.info("VM在清理时已断开连接。");
            } catch (Exception e) {
                logger.error("清理VM连接时发生未知错误: {}", e.getMessage());
            }
        }
        Process currentProcess = process.getAndSet(null);
        if (currentProcess != null && currentProcess.isAlive()) {
            currentProcess.destroyForcibly();
            logger.info("被调试的进程已被强制终止。");
        }
        logger.info("调试会话清理完成。");
    }

    private void handleEvent(Event event) {
        if (event instanceof VMDisconnectEvent || event instanceof VMDeathEvent) {
            logger.info("检测到 VM 断开或死亡事件，开始清理...");
            cleanup();
            webSocketService.sendDebugEvent(new WsDebugEvent<>("TERMINATED", null));
        } else if (event instanceof BreakpointEvent) {
            handleBreakpointEvent((BreakpointEvent) event);
        } else if (event instanceof StepEvent) {
            handleBreakpointEvent((StepEvent) event);
        } else if (event instanceof ClassPrepareEvent cpe) {
            String className = cpe.referenceType().name();
            String guessedFilePath = guessFilePathFromClassName(className);
            List<BreakpointRequest> bpList = userBreakpoints.get(guessedFilePath);

            if (bpList != null) {
                logger.info("类 '{}' 已准备好，找到 {} 个关联断点，准备应用。", className, bpList.size());
                bpList.forEach(bp -> {
                    if (bp.isEnabled()) {
                        applyBreakpointChange(event.virtualMachine(), bp.getFilePath(), bp.getLineNumber(), true);
                    }
                });
            }
        }
    }

    private void applyBreakpointChange(VirtualMachine vm, String filePath, int lineNumber, boolean enabled) {
        String className = guessClassNameFromFilePath(filePath);
        List<ReferenceType> classes = vm.classesByName(className);
        if (classes.isEmpty()) {
            logger.warn("在VM中找不到类 '{}' (从路径 '{}' 解析得到)，无法应用断点。类可能尚未加载。", className, filePath);
            return;
        }
        try {
            List<Location> locations = classes.get(0).locationsOfLine(lineNumber);
            if (locations.isEmpty()) {
                logger.warn("在文件 {} 的行 {} 找不到位置，无法应用断点变更", filePath, lineNumber);
                return;
            }
            Location loc = locations.get(0);
            vm.eventRequestManager().breakpointRequests().stream()
                    .filter(req -> req.location().equals(loc))
                    .forEach(req -> vm.eventRequestManager().deleteEventRequest(req));
            if (enabled) {
                com.sun.jdi.request.BreakpointRequest bpReq = vm.eventRequestManager().createBreakpointRequest(loc);
                bpReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                bpReq.enable();
                logger.info("动态应用断点于: {}", loc);
            } else {
                logger.info("动态移除断点于: {}", loc);
            }
        } catch (AbsentInformationException e) {
            logger.error("无法应用断点变更，请确保代码已使用调试信息编译 (-g)", e);
        }
    }

    public void resumeDebug() {
        VirtualMachine currentVm = vm.get();
        if (isDebugging(currentVm)) {
            currentVm.resume();
            webSocketService.sendDebugEvent(new WsDebugEvent<>("RESUMED", null));
        }
    }

    public void stepOver() { executeStep(StepRequest.STEP_OVER); }
    public void stepInto() { executeStep(StepRequest.STEP_INTO); }
    public void stepOut() { executeStep(StepRequest.STEP_OUT); }

    private void executeStep(int stepType) {
        VirtualMachine currentVm = vm.get();
        if (isDebugging(currentVm)) {
            try {
                ThreadReference thread = getSuspendedThread(currentVm);
                if (thread != null) {
                    currentVm.eventRequestManager().deleteEventRequests(currentVm.eventRequestManager().stepRequests());
                    StepRequest request = currentVm.eventRequestManager().createStepRequest(thread, StepRequest.STEP_LINE, stepType);
                    request.addCountFilter(1);
                    request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                    request.enable();
                    currentVm.resume();
                    webSocketService.sendDebugEvent(new WsDebugEvent<>("RESUMED", null));
                }
            } catch (Exception e) {
                logger.error("执行单步操作失败", e);
            }
        }
    }

    private void configureAndStartEventHandling(VirtualMachine virtualMachine) {
        eventThread = new Thread(() -> {
            try {
                EventQueue eventQueue = virtualMachine.eventQueue();
                while (!Thread.currentThread().isInterrupted()) {
                    EventSet eventSet = eventQueue.remove();
                    for (Event event : eventSet) {
                        handleEvent(event);
                    }
                    eventSet.resume();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (VMDisconnectedException e) {
                logger.info("VM 在事件处理期间断开连接，将执行清理。");
                cleanup();
            }
        }, "JDI-Event-Handler");
        eventThread.setDaemon(true);
        eventThread.start();
    }

    private void handleBreakpointEvent(LocatableEvent event) {
        try {
            LocationInfo location = createLocationData(event.location());
            List<StackFrameInfo> callStack = getCallStack(event.thread());
            List<VariableInfo> variables = getVariables(event.thread().frame(0));
            PausedEventData data = new PausedEventData(location, variables, callStack);

            webSocketService.sendDebugEvent(new WsDebugEvent<>("PAUSED", data));
        } catch (Exception e) {
            logger.error("处理断点事件时出错", e);
        }
    }

    private LocationInfo createLocationData(Location loc) {
        try {
            return new LocationInfo(
                    guessFilePathFromClassName(loc.declaringType().name()),
                    loc.sourceName(),
                    loc.lineNumber()
            );
        } catch (AbsentInformationException e) {
            return new LocationInfo(
                    guessFilePathFromClassName(loc.declaringType().name()),
                    "Unknown",
                    loc.lineNumber()
            );
        }
    }

    private List<VariableInfo> getVariables(StackFrame frame) throws IncompatibleThreadStateException, AbsentInformationException {
        List<VariableInfo> vars = new ArrayList<>();
        for (LocalVariable variable : frame.visibleVariables()) {
            com.sun.jdi.Value jdiValue = frame.getValue(variable);
            vars.add(new VariableInfo(variable.name(), variable.typeName(), valueToString(jdiValue)));
        }
        return vars;
    }

    private String valueToString(com.sun.jdi.Value jdiValue) {
        if (jdiValue == null) return "null";
        if (jdiValue instanceof StringReference) return "\"" + ((StringReference) jdiValue).value() + "\"";
        if (jdiValue instanceof PrimitiveValue) return jdiValue.toString();
        if (jdiValue instanceof ObjectReference) {
            return jdiValue.type().name() + " (id=" + ((ObjectReference) jdiValue).uniqueID() + ")";
        }
        return "N/A";
    }

    private List<StackFrameInfo> getCallStack(ThreadReference thread) throws IncompatibleThreadStateException {
        List<StackFrameInfo> stack = new ArrayList<>();
        for (StackFrame frame : thread.frames()) {
            try {
                stack.add(new StackFrameInfo(frame.location().method().name(), frame.location().sourceName(), frame.location().lineNumber()));
            } catch (AbsentInformationException e) {
                stack.add(new StackFrameInfo(frame.location().method().name(), "Unknown", frame.location().lineNumber()));
            }
        }
        return stack;
    }

    private ThreadReference getSuspendedThread(VirtualMachine vm) {
        return vm.allThreads().stream()
                .filter(ThreadReference::isSuspended)
                .findFirst()
                .orElse(null);
    }

    private boolean isDebugging() { return vm.get() != null; }

    private boolean isDebugging(VirtualMachine currentVm) {
        if (currentVm == null) {
            logger.warn("操作失败：没有活动的调试会话。");
            return false;
        }
        return true;
    }

    private String guessClassNameFromFilePath(String filePath) {
        String path = filePath.replace("\\", "/");
        if (path.startsWith("src/main/java/")) {
            path = path.substring("src/main/java/".length());
        } else if (path.startsWith("src/test/java/")) {
            path = path.substring("src/test/java/".length());
        }

        String pathWithoutExt = path.endsWith(".java") ? path.substring(0, path.length() - 5) : path;
        return pathWithoutExt.replace("/", ".");
    }

    private String guessFilePathFromClassName(String className) {
        return "src/main/java/" + className.replace(".", "/") + ".java";
    }
}