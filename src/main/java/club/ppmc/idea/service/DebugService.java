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
import com.sun.jdi.AbsentInformationException;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.IncompatibleThreadStateException;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.Location;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.PrimitiveValue;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.StackFrame;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.VMDisconnectedException;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.VirtualMachineManager;
import com.sun.jdi.connect.AttachingConnector;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.IllegalConnectorArgumentsException;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.Event;
import com.sun.jdi.event.EventQueue;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.LocatableEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.StepRequest;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

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

    private volatile Thread eventThread;

    public DebugService(
            WebSocketNotificationService notificationService,
            MavenProjectHelper mavenHelper,
            SettingsService settingsService) {
        this.notificationService = notificationService;
        this.mavenHelper = mavenHelper;
        this.settingsService = settingsService;
    }

    /**
     * 动态获取最新的工作区根目录。
     */
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
                // 等待旧进程资源释放
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                LOGGER.warn("清理等待期间被中断。");
            }
        }

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

            // 监听类加载事件，以便在类加载后动态设置断点
            ClassPrepareRequest cpr = newVm.eventRequestManager().createClassPrepareRequest();
            cpr.addClassFilter("*");
            cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            cpr.enable();

            configureAndStartEventHandling(newVm);
            notificationService.sendDebugEvent(new WsDebugEvent<>("STARTED", null));
            newVm.resume(); // 让目标VM继续执行
            LOGGER.info("调试会话已完全启动并恢复运行。");
        } catch (Exception e) {
            // Unboxing a potential CompletionException
            var cause = e.getCause() != null ? e.getCause() : e;
            LOGGER.error("附加到VM或启动事件处理时失败: {}", cause.getMessage(), cause);
            cleanup();
            notificationService.sendBuildLog("[错误] 附加调试器失败: " + cause.getMessage());
        }
    }

    private CompletableFuture<Process> launchDebugeeProcess(String projectPath, String mainClass)
            throws IOException {
        // ========================= 关键修改 START: 重构逻辑，确保在编译前获取并验证JDK和Maven路径 =========================
        // 步骤 1: 获取环境配置
        Settings settings = settingsService.getSettings();
        Path projectDir = getWorkspaceRoot().resolve(projectPath);

        // 步骤 1a: 获取并验证 Maven
        String mavenHome = settings.getMavenHome();
        if (!StringUtils.hasText(mavenHome)) {
            throw new IOException("编译失败: Maven 主目录未在设置中配置。");
        }
        String mvnExecutableName = System.getProperty("os.name").toLowerCase().contains("win") ? "mvn.cmd" : "mvn";
        Path mvnExecutablePath = Paths.get(mavenHome, "bin", mvnExecutableName);
        if (!Files.isExecutable(mvnExecutablePath)) {
            throw new IOException("编译失败: 在配置的Maven主目录中找不到或无法执行 mvn 命令: " + mvnExecutablePath);
        }

        // 步骤 1b: 获取并验证 JDK
        String jdkVersion =
                mavenHelper.getJavaVersionFromPom(
                        projectDir.toFile(), notificationService::sendBuildLog);
        String javaExecutable =
                settings.getJdkPaths().get("jdk" + jdkVersion); // 从settings中获取JDK路径

        if (javaExecutable == null || !new File(javaExecutable).exists()) {
            LOGGER.warn("未找到为项目配置的JDK'{}'，将回退到系统默认'java'。", "jdk" + jdkVersion);
            notificationService.sendBuildLog(
                    String.format("[警告] 未在设置中找到JDK %s，将尝试使用系统默认'java'。", jdkVersion));
            javaExecutable = "java"; // 安全回退
        }
        // 从java可执行文件路径推断JDK主目录
        Path jdkHome = Paths.get(javaExecutable).getParent().getParent();

        // 步骤 2: 使用指定的JDK编译项目
        runMavenCompile(projectPath, mvnExecutablePath.toAbsolutePath().toString(), jdkHome.toString());
        // ========================= 关键修改 END =======================================================================

        Path classesDir = projectDir.resolve("target/classes");
        if (!Files.exists(classesDir)) {
            throw new IOException("编译产物目录 'target/classes' 不存在。请检查编译是否成功。");
        }

        // 步骤 3: 构建调试命令
        String jdwpConfig =
                String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=%d", JDWP_PORT);

        List<String> command = new ArrayList<>();
        command.add(javaExecutable);
        command.add(jdwpConfig);
        command.add("-cp");
        command.add(classesDir.toAbsolutePath().toString());
        command.add(mainClass);

        ProcessBuilder pb = new ProcessBuilder(command).directory(projectDir.toFile());
        LOGGER.info("执行调试命令: {}", String.join(" ", pb.command()));

        // 步骤 4: 启动进程并监听JDWP握手信息
        Process p = pb.start();
        var processReadyFuture = new CompletableFuture<Process>();
        redirectStream(p, p.getInputStream(), "信息", processReadyFuture);
        redirectStream(p, p.getErrorStream(), "错误", processReadyFuture);

        return processReadyFuture.orTimeout(90, TimeUnit.SECONDS);
    }

    // ========================= 关键修改 START: 方法签名变更，并增加设置环境变量的逻辑 =========================
    private void runMavenCompile(String projectPath, String mvnExecutable, String jdkHome) throws IOException {
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        var pb = new ProcessBuilder(mvnExecutable, "compile").directory(projectDir.toFile());

        // 为 Maven 进程设置 JAVA_HOME 环境变量
        Map<String, String> env = pb.environment();
        env.put("JAVA_HOME", jdkHome);
        LOGGER.info("正在为调试编译设置 JAVA_HOME: {}", jdkHome);
        notificationService.sendBuildLog("[信息] 编译使用 JDK: " + jdkHome);

        pb.redirectErrorStream(true);
        // ========================= 关键修改 END =================================================================

        LOGGER.info("正在为调试执行编译: {} compile", mvnExecutable);
        notificationService.sendBuildLog("[信息] 正在执行 Maven 编译...");
        Process compileProcess = pb.start();

        try (var reader = new BufferedReader(new InputStreamReader(compileProcess.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                notificationService.sendBuildLog("[编译] " + line);
            }
        }

        try {
            int exitCode = compileProcess.waitFor();
            if (exitCode != 0) {
                throw new IOException("Maven 编译失败，退出码: " + exitCode);
            }
            LOGGER.info("编译成功。");
            notificationService.sendBuildLog("[信息] 编译成功。");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("编译过程被中断。", e);
        }
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

                    // 如果流结束了但future还未完成，说明进程启动失败
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
        arguments.get("timeout").setValue("10000"); // 10秒超时

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

    // ... 其他方法（step, resume, breakpoint等）和事件处理逻辑保持不变 ...
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
            // 只处理第一个匹配的类
            ReferenceType refType = classes.get(0);
            List<Location> locations = refType.locationsOfLine(lineNumber);
            if (locations.isEmpty()) {
                LOGGER.warn("在文件 {} 的行 {} 找不到可执行代码位置，无法应用断点变更", filePath, lineNumber);
                return;
            }
            Location loc = locations.get(0);

            // 移除此位置所有旧的断点请求
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
            LOGGER.error("无法应用断点变更，请确保代码已使用调试信息编译 (-g)", e);
        }
    }

    public void resumeDebug() {
        VirtualMachine currentVm = vm.get();
        if (isDebugging(currentVm)) {
            currentVm.resume();
            notificationService.sendDebugEvent(new WsDebugEvent<>("RESUMED", null));
        }
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

    private void executeStep(int stepType) {
        VirtualMachine currentVm = vm.get();
        if (!isDebugging(currentVm)) return;

        try {
            ThreadReference thread = getSuspendedThread(currentVm);
            if (thread != null) {
                // 清理所有旧的单步请求
                currentVm.eventRequestManager().deleteEventRequests(currentVm.eventRequestManager().stepRequests());

                StepRequest request = currentVm.eventRequestManager().createStepRequest(thread, StepRequest.STEP_LINE, stepType);
                request.addCountFilter(1); // 只执行一步
                request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                request.enable();

                currentVm.resume(); // 恢复执行以完成这一步
                notificationService.sendDebugEvent(new WsDebugEvent<>("RESUMED", null));
            } else {
                LOGGER.warn("无法执行单步操作：没有找到已暂停的线程。");
            }
        } catch (Exception e) {
            LOGGER.error("执行单步操作失败", e);
        }
    }


    private void configureAndStartEventHandling(VirtualMachine virtualMachine) {
        eventThread =
                new Thread(
                        () -> {
                            try {
                                EventQueue eventQueue = virtualMachine.eventQueue();
                                while (!Thread.currentThread().isInterrupted()) {
                                    EventSet eventSet = eventQueue.remove(); // 阻塞直到有事件
                                    for (Event event : eventSet) {
                                        handleEvent(event);
                                    }
                                    eventSet.resume(); // 处理完后恢复目标VM
                                }
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt(); // 保持中断状态
                            } catch (VMDisconnectedException e) {
                                LOGGER.info("VM 在事件处理期间断开连接，将执行清理。");
                                cleanup();
                                notificationService.sendDebugEvent(new WsDebugEvent<>("TERMINATED", null));
                            }
                        },
                        "JDI-Event-Handler");
        eventThread.setDaemon(true);
        eventThread.start();
    }

    private void handleEvent(Event event) {
        if (event instanceof VMDisconnectEvent || event instanceof VMDeathEvent) {
            LOGGER.info("检测到 VM 断开或死亡事件。");
            // 清理工作会由VMDisconnectedException的catch块或外部stop调用处理
        } else if (event instanceof BreakpointEvent bpEvent) {
            handlePausedEvent(bpEvent);
        } else if (event instanceof StepEvent stepEvent) {
            handlePausedEvent(stepEvent);
        } else if (event instanceof ClassPrepareEvent cpe) {
            // 当一个类被加载时，检查是否有为它预设的断点
            String className = cpe.referenceType().name();
            String guessedFilePath = guessFilePathFromClassName(className);
            List<club.ppmc.idea.model.debug.BreakpointRequest> bpList = userBreakpoints.get(guessedFilePath);

            if (bpList != null && !bpList.isEmpty()) {
                LOGGER.info("类 '{}' 已准备好，找到 {} 个关联断点，准备应用。", className, bpList.size());
                bpList.forEach(
                        bp -> {
                            if (bp.enabled()) {
                                applyBreakpointChange(event.virtualMachine(), bp.filePath(), bp.lineNumber(), true);
                            }
                        });
            }
        }
    }

    private void handlePausedEvent(LocatableEvent event) {
        try {
            LocationInfo location = createLocationData(event.location());
            List<StackFrameInfo> callStack = getCallStack(event.thread());
            List<VariableInfo> variables = getVariables(event.thread().frame(0)); // 获取顶层栈帧的变量
            var pausedData = new PausedEventData(location, variables, callStack);

            notificationService.sendDebugEvent(new WsDebugEvent<>("PAUSED", pausedData));
        } catch (Exception e) {
            LOGGER.error("处理断点或单步事件时出错", e);
            // 尝试恢复VM，避免卡死
            event.virtualMachine().resume();
        }
    }

    private LocationInfo createLocationData(Location loc) {
        try {
            return new LocationInfo(
                    guessFilePathFromClassName(loc.declaringType().name()), loc.sourceName(), loc.lineNumber());
        } catch (AbsentInformationException e) {
            // 如果没有源文件名信息，也尽量提供路径和行号
            return new LocationInfo(
                    guessFilePathFromClassName(loc.declaringType().name()), "Unknown Source", loc.lineNumber());
        }
    }

    private List<VariableInfo> getVariables(StackFrame frame)
            throws IncompatibleThreadStateException, AbsentInformationException {
        var vars = new ArrayList<VariableInfo>();
        for (LocalVariable variable : frame.visibleVariables()) {
            com.sun.jdi.Value jdiValue = frame.getValue(variable);
            vars.add(new VariableInfo(variable.name(), variable.typeName(), valueToString(jdiValue)));
        }
        return vars;
    }

    private String valueToString(com.sun.jdi.Value jdiValue) {
        if (jdiValue == null) return "null";
        if (jdiValue instanceof StringReference strRef) return "\"" + strRef.value() + "\"";
        if (jdiValue instanceof PrimitiveValue) return jdiValue.toString();
        if (jdiValue instanceof ObjectReference objRef) {
            return objRef.type().name() + " (id=" + objRef.uniqueID() + ")";
        }
        return "N/A";
    }

    private List<StackFrameInfo> getCallStack(ThreadReference thread)
            throws IncompatibleThreadStateException {
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

    private ThreadReference getSuspendedThread(VirtualMachine vm) {
        return vm.allThreads().stream().filter(ThreadReference::isSuspended).findFirst().orElse(null);
    }

    private boolean isDebugging() {
        return vm.get() != null;
    }

    private boolean isDebugging(VirtualMachine currentVm) {
        if (currentVm == null) {
            LOGGER.warn("操作失败：没有活动的调试会话。");
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