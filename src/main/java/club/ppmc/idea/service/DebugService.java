/**
 * DebugService.java
 *
 * 该服务负责管理Java程序的调试会话。它处理调试进程的启动、附加、断点管理、
 * 单步执行以及与前端的WebSocket通信。
 * 它依赖 SettingsService 获取环境配置，并与 WebSocketNotificationService 交互以发送调试事件。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.Settings;
import club.ppmc.idea.model.debug.LocationInfo;
import club.ppmc.idea.model.debug.PausedEventData;
import club.ppmc.idea.model.debug.StackFrameInfo;
import club.ppmc.idea.model.debug.VariableInfo;
import club.ppmc.idea.model.debug.WsDebugEvent;
import club.ppmc.idea.util.MavenProjectHelper;
import com.sun.jdi.*;
import com.sun.jdi.connect.AttachingConnector;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.IllegalConnectorArgumentsException;
import com.sun.jdi.event.*;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.StepRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class DebugService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DebugService.class);
    private static final int JDWP_PORT = 5005;

    private final WebSocketNotificationService notificationService;
    private final MavenProjectHelper mavenHelper;
    private final SettingsService settingsService;

    private final AtomicReference<VirtualMachine> vm = new AtomicReference<>();
    private final AtomicReference<Process> debugeeProcess = new AtomicReference<>();
    private final Map<String, List<club.ppmc.idea.model.debug.BreakpointRequest>> userBreakpoints =
            new ConcurrentHashMap<>();

    private final AtomicBoolean mainBreakpointSetAndResumed = new AtomicBoolean(false);
    private volatile String mainClassNameForDebug;

    private volatile Thread eventThread;

    public DebugService(
            WebSocketNotificationService notificationService,
            MavenProjectHelper mavenHelper,
            SettingsService settingsService) {
        this.notificationService = notificationService;
        this.mavenHelper = mavenHelper;
        this.settingsService = settingsService;
    }

    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    public synchronized void startDebug(String projectPath, String mainClass) {
        LOGGER.info("请求启动调试会话，项目: {}, 主类: {}", projectPath, mainClass);

        if (isDebugging()) {
            LOGGER.warn("检测到活动的调试会话，将先进行清理...");
            cleanup();
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                LOGGER.warn("清理等待期间被中断。");
            }
        }

        this.mainClassNameForDebug = mainClass;
        this.mainBreakpointSetAndResumed.set(false);

        try {
            launchDebugeeProcess(projectPath, mainClass)
                    .thenAcceptAsync(this::attachAndConfigureVm)
                    .exceptionally(
                            ex -> {
                                LOGGER.error("启动或附加调试进程失败: {}", ex.getMessage(), ex.getCause());
                                cleanup();
                                notificationService.sendBuildLog(
                                        "[错误] 启动调试失败: " + ex.getCause().getMessage());
                                return null;
                            });
        } catch (IOException e) {
            LOGGER.error("创建被调试进程时发生 I/O 错误: {}", e.getMessage(), e);
            cleanup();
            notificationService.sendBuildLog("[错误] 启动调试失败: " + e.getMessage());
        }
    }

    private void attachAndConfigureVm(Process newProcess) {
        this.debugeeProcess.set(newProcess);
        LOGGER.info("被调试进程已启动并准备好附加，PID: {}", newProcess.pid());
        try {
            VirtualMachine newVm = attachToVm();
            this.vm.set(newVm);
            LOGGER.info("已成功附加到 VM: {}", newVm.description());

            ClassPrepareRequest cpr = newVm.eventRequestManager().createClassPrepareRequest();
            cpr.addClassFilter("*");
            cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            cpr.enable();

            configureAndStartEventHandling(newVm);
            notificationService.sendDebugEvent(new WsDebugEvent<>("STARTED", null));
            LOGGER.info("调试器已附加。等待 ClassPrepareEvents 以设置断点并开始执行。");
        } catch (Exception e) {
            var cause = e.getCause() != null ? e.getCause() : e;
            LOGGER.error("附加到VM或启动事件处理时失败: {}", cause.getMessage(), cause);
            cleanup();
            notificationService.sendBuildLog("[错误] 附加调试器失败: " + cause.getMessage());
        }
    }

    private CompletableFuture<Process> launchDebugeeProcess(String projectPath, String mainClass)
            throws IOException {
        Settings settings = settingsService.getSettings();
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        String jdkVersion = mavenHelper.getJavaVersionFromPom(projectDir.toFile(), notificationService::sendBuildLog);
        String javaExecutable = mavenHelper.selectJdkExecutable(settings, jdkVersion, notificationService::sendBuildLog);

        List<String> mavenGoals = Arrays.asList("clean", "install", "dependency:copy-dependencies", "-U");
        int buildExitCode = mavenHelper.executeMavenBuild(projectPath, settings, mavenGoals);

        if (buildExitCode != 0) {
            throw new IOException("Maven 编译失败，退出码: " + buildExitCode + "。已终止调试启动。");
        }

        String classpath = buildClasspath(projectDir);
        String jdwpConfig =
                String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=%d", JDWP_PORT);

        List<String> command = new ArrayList<>();
        command.add(javaExecutable);
        command.add(jdwpConfig);
        command.add("-cp");
        command.add(classpath);
        command.add(mainClass);

        ProcessBuilder pb = new ProcessBuilder(command).directory(projectDir.toFile());
        LOGGER.info("执行调试命令: {}", String.join(" ", pb.command()));

        Process p = pb.start();
        var processReadyFuture = new CompletableFuture<Process>();
        redirectStream(p, p.getInputStream(), "信息", processReadyFuture);
        redirectStream(p, p.getErrorStream(), "错误", processReadyFuture);

        return processReadyFuture.orTimeout(90, TimeUnit.SECONDS);
    }

    private String buildClasspath(Path projectDir) throws IOException {
        Path targetDir = projectDir.resolve("target");
        Path classesDir = targetDir.resolve("classes");
        Path dependencyDir = targetDir.resolve("dependency");

        if (!Files.isDirectory(classesDir)) {
            throw new IOException("未找到编译输出目录 'target/classes'。请确认 Maven 构建是否成功。");
        }

        List<String> classpathEntries = new ArrayList<>();
        classpathEntries.add(classesDir.toAbsolutePath().toString());

        if (Files.isDirectory(dependencyDir)) {
            try (var dependencyJars = Files.walk(dependencyDir)) {
                List<String> jarPaths = dependencyJars
                        .filter(path -> path.toString().endsWith(".jar"))
                        .map(path -> path.toAbsolutePath().toString())
                        .toList();
                classpathEntries.addAll(jarPaths);
            }
        }
        return String.join(File.pathSeparator, classpathEntries);
    }

    private void redirectStream(
            Process p, InputStream inputStream, String prefix, CompletableFuture<Process> readyFuture) {
        new Thread(
                () -> {
                    try (var reader = new BufferedReader(new InputStreamReader(inputStream))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            notificationService.sendRunLog(String.format("[%s] %s", prefix, line));
                            if (!readyFuture.isDone() && line.contains("Listening for transport dt_socket")) {
                                LOGGER.info("检测到JDWP监听日志，准备附加调试器...");
                                readyFuture.complete(p);
                            }
                        }
                    } catch (IOException e) {
                        LOGGER.warn("读取进程流时出错 (可能是进程已结束): {}", e.getMessage());
                    }

                    if (!readyFuture.isDone()) {
                        String errorMsg = "进程意外终止，未能启动调试模式。请检查日志输出以获取详细错误。";
                        LOGGER.error(errorMsg);
                        readyFuture.completeExceptionally(new IOException(errorMsg));
                    }
                })
                .start();
    }

    private VirtualMachine attachToVm() throws IOException, IllegalConnectorArgumentsException {
        VirtualMachineManager vmm = Bootstrap.virtualMachineManager();
        AttachingConnector connector =
                vmm.attachingConnectors().stream()
                        .filter(c -> "dt_socket".equals(c.transport().name()))
                        .findFirst()
                        .orElseThrow(() -> new IOException("找不到 dt_socket attaching connector"));

        Map<String, Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("port").setValue(String.valueOf(JDWP_PORT));
        arguments.get("hostname").setValue("localhost");
        arguments.get("timeout").setValue("10000");

        return connector.attach(arguments);
    }

    public void stopDebug() {
        LOGGER.info("收到手动停止调试请求...");
        cleanup();
        notificationService.sendDebugEvent(new WsDebugEvent<>("TERMINATED", null));
    }

    private synchronized void cleanup() {
        LOGGER.info("开始清理调试会话...");

        if (eventThread != null && eventThread.isAlive()) {
            eventThread.interrupt();
            try {
                eventThread.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            LOGGER.info("调试事件线程已中断。");
            eventThread = null;
        }

        VirtualMachine currentVm = vm.getAndSet(null);
        if (currentVm != null) {
            try {
                if (currentVm.process() != null) {
                    currentVm.eventRequestManager().deleteAllBreakpoints();
                    currentVm.dispose();
                    LOGGER.info("VM 连接已释放。");
                }
            } catch (VMDisconnectedException ignored) {
                LOGGER.info("VM在清理时已断开连接。");
            } catch (Exception e) {
                LOGGER.error("清理VM连接时发生未知错误: {}", e.getMessage());
            }
        }

        Process currentProcess = debugeeProcess.getAndSet(null);
        if (currentProcess != null && currentProcess.isAlive()) {
            currentProcess.destroyForcibly();
            LOGGER.info("被调试的进程已被强制终止。");
        }
        LOGGER.info("调试会话清理完成。");
    }

    public void toggleBreakpoint(String filePath, int lineNumber, boolean enabled) {
        var fileBreakpoints = userBreakpoints.computeIfAbsent(filePath, k -> new ArrayList<>());
        fileBreakpoints.removeIf(bp -> bp.lineNumber() == lineNumber);
        if (enabled) {
            fileBreakpoints.add(new club.ppmc.idea.model.debug.BreakpointRequest(filePath, lineNumber, true));
        }

        VirtualMachine currentVm = vm.get();
        if (currentVm != null) {
            applyBreakpointChange(currentVm, filePath, lineNumber, enabled);
        }
    }

    private void applyBreakpointChange(VirtualMachine vm, String filePath, int lineNumber, boolean enabled) {
        String className = guessClassNameFromFilePath(filePath);
        List<ReferenceType> classes = vm.classesByName(className);
        if (classes.isEmpty()) {
            LOGGER.warn("在VM中找不到类 '{}'，无法应用断点。类可能尚未加载。", className);
            return;
        }
        try {
            ReferenceType refType = classes.get(0);
            List<Location> locations = refType.locationsOfLine(lineNumber);
            if (locations.isEmpty()) {
                LOGGER.warn("在文件 {} 的行 {} 找不到可执行代码位置，无法应用断点变更", filePath, lineNumber);
                notificationService.sendBuildLog(String.format(
                        "[警告] 无法在 %s:%d 设置断点，该行可能没有可执行的代码。", filePath.split("/")[filePath.split("/").length-1], lineNumber));
                return;
            }
            Location loc = locations.get(0);

            vm.eventRequestManager().breakpointRequests().stream()
                    .filter(req -> req.location().equals(loc))
                    .forEach(req -> vm.eventRequestManager().deleteEventRequest(req));

            if (enabled) {
                BreakpointRequest bpReq = vm.eventRequestManager().createBreakpointRequest(loc);
                bpReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                bpReq.enable();
                LOGGER.info("动态应用断点于: {}", loc);
            } else {
                LOGGER.info("动态移除断点于: {}", loc);
            }
        } catch (AbsentInformationException e) {
            String errorMessage = String.format(
                    "[警告] 无法在 %s:%d 设置断点。请确保项目编译时包含了调试信息 (例如，Maven Compiler Plugin 的 <debug> 设置为 true)。",
                    filePath, lineNumber);
            LOGGER.error("无法应用断点变更: {}", errorMessage, e);
            notificationService.sendBuildLog(errorMessage);
        }
    }

    public void resumeDebug() {
        VirtualMachine currentVm = vm.get();
        if (isDebugging(currentVm)) {
            currentVm.resume();
            notificationService.sendDebugEvent(new WsDebugEvent<>("RESUMED", null));
        }
    }

    public void stepOver() { executeStep(StepRequest.STEP_OVER); }
    public void stepInto() { executeStep(StepRequest.STEP_INTO); }
    public void stepOut() { executeStep(StepRequest.STEP_OUT); }

    private void executeStep(int stepType) {
        VirtualMachine currentVm = vm.get();
        if (!isDebugging(currentVm)) return;

        try {
            ThreadReference thread = getSuspendedThread(currentVm);
            if (thread != null) {
                currentVm.eventRequestManager().deleteEventRequests(currentVm.eventRequestManager().stepRequests());
                StepRequest request = currentVm.eventRequestManager().createStepRequest(thread, StepRequest.STEP_LINE, stepType);
                request.addCountFilter(1);
                request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                request.enable();
                currentVm.resume();
                notificationService.sendDebugEvent(new WsDebugEvent<>("RESUMED", null));
            } else {
                LOGGER.warn("无法执行单步操作：没有找到已暂停的线程。");
            }
        } catch (Exception e) {
            LOGGER.error("执行单步操作失败", e);
        }
    }

    private void configureAndStartEventHandling(VirtualMachine virtualMachine) {
        eventThread = new Thread(() -> {
            try {
                EventQueue eventQueue = virtualMachine.eventQueue();
                while (!Thread.currentThread().isInterrupted()) {
                    EventSet eventSet = eventQueue.remove();
                    boolean manuallyResumedInSet = false;
                    for (Event event : eventSet) {
                        if (handleEvent(event)) {
                            manuallyResumedInSet = true;
                        }
                    }
                    if (!manuallyResumedInSet) {
                        eventSet.resume();
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (VMDisconnectedException e) {
                LOGGER.info("VM 在事件处理期间断开连接，将执行清理。");
                cleanup();
                notificationService.sendDebugEvent(new WsDebugEvent<>("TERMINATED", null));
            }
        }, "JDI-Event-Handler");
        eventThread.setDaemon(true);
        eventThread.start();
    }

    /**
     * 处理 JDI 事件。
     * @return true 如果事件处理器不希望外层循环自动恢复VM（例如，因为VM已暂停或已手动恢复），否则返回 false。
     */
    private boolean handleEvent(Event event) {
        if (event instanceof VMDisconnectEvent || event instanceof VMDeathEvent) {
            LOGGER.info("检测到 VM 断开或死亡事件。");
        } else if (event instanceof BreakpointEvent bpEvent) {
            handlePausedEvent(bpEvent);
            return true; // ========================= 核心修复 #1 =========================
        } else if (event instanceof StepEvent stepEvent) {
            handlePausedEvent(stepEvent);
            return true; // ========================= 核心修复 #2 =========================
        } else if (event instanceof ClassPrepareEvent cpe) {
            ReferenceType refType = cpe.referenceType();
            String className = refType.name();

            if (className.equals(this.mainClassNameForDebug) && !mainBreakpointSetAndResumed.get()) {
                LOGGER.info("主类 '{}' 已准备好。正在设置入口断点。", className);
                try {
                    setMainMethodEntryBreakpoint(refType);
                    LOGGER.info("入口断点已设置。正在恢复VM以命中该断点。");
                    event.virtualMachine().resume();
                    mainBreakpointSetAndResumed.set(true);
                    return true;
                } catch (Exception e) {
                    LOGGER.error("为 {} 设置主方法入口断点失败。正在中止调试。", className, e);
                    cleanup();
                    notificationService.sendBuildLog("[错误] 无法设置初始断点: " + e.getMessage());
                }
            }

            String guessedFilePath = guessFilePathFromClassName(className);
            List<club.ppmc.idea.model.debug.BreakpointRequest> bpList = userBreakpoints.get(guessedFilePath);
            if (bpList != null && !bpList.isEmpty()) {
                LOGGER.info("类 '{}' 已准备好，找到 {} 个关联断点，准备应用。", className, bpList.size());
                bpList.forEach(bp -> {
                    if (bp.enabled()) {
                        applyBreakpointChange(event.virtualMachine(), bp.filePath(), bp.lineNumber(), true);
                    }
                });
            }
        }
        return false;
    }

    /**
     * 处理所有暂停事件（断点、单步）。
     * 新增逻辑：如果暂停在外部代码（如JDK库），则自动执行“步出”操作，而不是通知前端。
     *
     * @param event 暂停事件
     */
    private void handlePausedEvent(LocatableEvent event) {
        try {
            if (isJdkClass(event.location().declaringType().name())) {
                LOGGER.info("调试器暂停在外部代码 {}。将自动执行“步出”。", event.location());
                stepOut();
                return;
            }

            LocationInfo location = createLocationData(event.location());
            List<StackFrameInfo> callStack = getCallStack(event.thread());
            List<VariableInfo> variables = getVariables(event.thread().frame(0));
            var pausedData = new PausedEventData(location, variables, callStack);
            notificationService.sendDebugEvent(new WsDebugEvent<>("PAUSED", pausedData));
        } catch (Exception e) {
            LOGGER.error("处理断点或单步事件时出错", e);
            event.virtualMachine().resume();
        }
    }

    private LocationInfo createLocationData(Location loc) {
        try {
            String className = loc.declaringType().name();
            if (isJdkClass(className)) {
                return new LocationInfo(null, loc.sourceName(), loc.lineNumber());
            } else {
                return new LocationInfo(guessFilePathFromClassName(className), loc.sourceName(), loc.lineNumber());
            }
        } catch (AbsentInformationException e) {
            return new LocationInfo(guessFilePathFromClassName(loc.declaringType().name()), "Unknown Source", loc.lineNumber());
        }
    }

    private List<VariableInfo> getVariables(StackFrame frame) throws IncompatibleThreadStateException, AbsentInformationException {
        var vars = new ArrayList<VariableInfo>();
        for (LocalVariable variable : frame.visibleVariables()) {
            Value jdiValue = frame.getValue(variable);
            vars.add(new VariableInfo(variable.name(), variable.typeName(), valueToString(jdiValue)));
        }
        return vars;
    }

    private String valueToString(Value jdiValue) {
        if (jdiValue == null) return "null";
        if (jdiValue instanceof StringReference strRef) return "\"" + strRef.value() + "\"";
        if (jdiValue instanceof PrimitiveValue) return jdiValue.toString();
        if (jdiValue instanceof ObjectReference objRef) return objRef.type().name() + " (id=" + objRef.uniqueID() + ")";
        return "N/A";
    }

    private List<StackFrameInfo> getCallStack(ThreadReference thread) throws IncompatibleThreadStateException {
        var stack = new ArrayList<StackFrameInfo>();
        for (StackFrame frame : thread.frames()) {
            Location loc = frame.location();
            try {
                stack.add(new StackFrameInfo(loc.method().name(), loc.sourceName(), loc.lineNumber()));
            } catch (AbsentInformationException e) {
                stack.add(new StackFrameInfo(loc.method().name(), "Unknown Source", loc.lineNumber()));
            }
        }
        return stack;
    }

    private void setMainMethodEntryBreakpoint(ReferenceType classType) throws AbsentInformationException {
        List<Method> methods = classType.methodsByName("main");
        if (methods.isEmpty()) {
            throw new IllegalStateException("在类 " + classType.name() + " 中找不到 main 方法");
        }
        Method mainMethod = methods.get(0);
        Location location = mainMethod.location();
        if (location == null || location.codeIndex() == -1) {
            throw new IllegalStateException("无法为 main 方法的入口找到一个有效的位置。");
        }
        BreakpointRequest bpReq = classType.virtualMachine().eventRequestManager().createBreakpointRequest(location);
        bpReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        bpReq.enable();
        LOGGER.info("已成功在 {} 创建入口断点", location);
    }

    private ThreadReference getSuspendedThread(VirtualMachine vm) {
        return vm.allThreads().stream().filter(ThreadReference::isSuspended).findFirst().orElse(null);
    }

    private boolean isDebugging() { return vm.get() != null; }
    private boolean isDebugging(VirtualMachine currentVm) {
        if (currentVm == null) {
            LOGGER.warn("操作失败：没有活动的调试会话。");
            return false;
        }
        return true;
    }

    private String guessClassNameFromFilePath(String filePath) {
        String path = filePath.replace("\\", "/");
        if (path.startsWith("src/main/java/")) path = path.substring("src/main/java/".length());
        else if (path.startsWith("src/test/java/")) path = path.substring("src/test/java/".length());
        String pathWithoutExt = path.endsWith(".java") ? path.substring(0, path.length() - 5) : path;
        return pathWithoutExt.replace("/", ".");
    }

    private String guessFilePathFromClassName(String className) {
        return "src/main/java/" + className.replace(".", "/") + ".java";
    }

    /**
     * 判断一个类名是否属于JDK核心库。
     * @param className 完全限定类名。
     * @return 如果是JDK类，则为true。
     */
    private boolean isJdkClass(String className) {
        return className.startsWith("java.") ||
                className.startsWith("javax.") ||
                className.startsWith("jdk.") ||
                className.startsWith("sun.") ||
                className.startsWith("com.sun.");
    }
}