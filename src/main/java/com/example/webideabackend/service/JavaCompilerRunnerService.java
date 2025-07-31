/**
 * JavaCompilerRunnerService.java
 *
 * 该服务类封装了执行系统命令以构建（使用Maven）和运行Java应用程序的核心逻辑。
 * 已重构为使用命令列表来避免路径分割问题。
 */
package com.example.webideabackend.service;

import com.example.webideabackend.util.SystemCommandExecutor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
public class JavaCompilerRunnerService {

    private final Path workspaceRoot;
    private final SystemCommandExecutor commandExecutor;
    private final WebSocketLogService logService;

    private static final String BUILD_LOG_TOPIC = "/topic/build-log";
    private static final String RUN_LOG_TOPIC = "/topic/run-log";
    private static final String DEBUG_LOG_TOPIC = "/topic/debug-events";

    public record DebugLaunchResult(Process process, int port) {}

    @Autowired
    public JavaCompilerRunnerService(
            @Value("${app.workspace-root}") String workspaceRootPath,
            SystemCommandExecutor commandExecutor,
            WebSocketLogService logService) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        this.commandExecutor = commandExecutor;
        this.logService = logService;
    }

    public DebugLaunchResult launchForDebug(String projectPath, String mainClass) throws IOException {
        var projectDir = workspaceRoot.resolve(projectPath).toFile(); // 关键修改
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            throw new IOException("Project directory not found: " + projectDir.getAbsolutePath());
        }

        int port = findFreePort();
        String jdwpOptions = String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:%d", port);

        List<String> commandList = buildJavaCommandList(projectDir, mainClass, jdwpOptions);
        if (commandList == null) {
            throw new IOException("No compiled artifacts found. Please build the project first.");
        }

        logService.sendMessage(DEBUG_LOG_TOPIC, "Starting debug session with command: " + String.join(" ", commandList));

        ProcessBuilder pb = new ProcessBuilder(commandList).directory(projectDir);
        return new DebugLaunchResult(pb.start(), port);
    }

    private List<String> buildJavaCommandList(File projectDir, String mainClass, String jvmOptions) {
        var targetDir = new File(projectDir, "target");
        var jarFile = new File(targetDir, projectDir.getName() + "-1.0-SNAPSHOT.jar");
        var classesDir = new File(targetDir, "classes");
        String effectiveClassPath;

        if (jarFile.exists()) {
            effectiveClassPath = jarFile.getAbsolutePath();
        } else if (classesDir.exists()) {
            effectiveClassPath = classesDir.getAbsolutePath();
        } else {
            return null; // No compiled artifacts
        }

        List<String> command = new ArrayList<>();
        command.add("java");
        if (jvmOptions != null && !jvmOptions.isBlank()) {
            command.add(jvmOptions);
        }
        command.add("-Dfile.encoding=UTF-8");
        command.add("-cp");
        command.add(effectiveClassPath);
        command.add(mainClass);

        return command;
    }

    private static int findFreePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        }
    }

    public CompletableFuture<Integer> runMavenBuild(String projectPath) {
        var projectDir = workspaceRoot.resolve(projectPath).toFile(); // 关键修改
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            logService.sendMessage(BUILD_LOG_TOPIC, errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        String mvnwCommandName = isWindows ? "mvnw.cmd" : "mvnw";
        File mvnwScriptFile = new File(projectDir, mvnwCommandName);

        if (!mvnwScriptFile.exists()) {
            String errorMessage = "Error: Maven wrapper script '" + mvnwCommandName + "' not found in project directory. Build cannot proceed.";
            logService.sendMessage(BUILD_LOG_TOPIC, errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        if (!isWindows) {
            if (!mvnwScriptFile.canExecute()) {
                logService.sendMessage(BUILD_LOG_TOPIC, "Attempting to set executable permission for mvnw script...");
                if (mvnwScriptFile.setExecutable(true)) {
                    logService.sendMessage(BUILD_LOG_TOPIC, "Successfully set executable permission for mvnw.");
                } else {
                    logService.sendMessage(BUILD_LOG_TOPIC, "Warning: Failed to set executable permission for mvnw. The build might fail.");
                }
            }
        }

        List<String> mavenCommand = Arrays.asList(
                mvnwScriptFile.getAbsolutePath(),
                "clean",
                "install",
                "-U",
                "-Dfile.encoding=UTF-8"
        );

        logService.sendMessage(BUILD_LOG_TOPIC, "Executing: " + String.join(" ", mavenCommand) + " in " + projectDir.getAbsolutePath());
        return commandExecutor.executeCommand(mavenCommand, projectDir,
                line -> logService.sendMessage(BUILD_LOG_TOPIC, line)
        );
    }

    public CompletableFuture<Integer> runJavaApplication(String projectPath, String mainClass) {
        var projectDir = workspaceRoot.resolve(projectPath).toFile(); // 关键修改
        List<String> commandList = buildJavaCommandList(projectDir, mainClass, "");
        if (commandList == null) {
            logService.sendMessage(RUN_LOG_TOPIC, "Error: No compiled artifacts found. Please build the project first.");
            return CompletableFuture.completedFuture(-1);
        }

        logService.sendMessage(RUN_LOG_TOPIC, "Executing: " + String.join(" ", commandList));
        return commandExecutor.executeCommand(commandList, projectDir,
                line -> logService.sendMessage(RUN_LOG_TOPIC, line)
        );
    }
}