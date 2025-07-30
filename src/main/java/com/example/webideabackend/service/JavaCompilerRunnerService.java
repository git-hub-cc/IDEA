/**
 * JavaCompilerRunnerService.java
 *
 * 该服务类封装了执行系统命令以构建（使用Maven）和运行Java应用程序的核心逻辑。
 * 已重构为使用命令列表来避免路径分割问题。
 *
 * 版本修正:
 * 为了解决在Linux/Docker环境中因`mvnw`脚本换行符问题导致的 "ZipException: zip END header not found" 错误，
 * 此版本将构建命令从依赖平台相关的 `./mvnw` 或 `mvnw.cmd` 脚本，修改为直接调用 `mvn` 命令。
 * 这一改动要求运行此服务的Docker容器环境中必须已安装Maven并将其添加到了系统PATH中。
 * 推荐使用如 `maven:3.9-eclipse-temurin-17` 的官方镜像。
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

    public DebugLaunchResult launchForDebug(String projectRelativePath, String mainClass) throws IOException {
        var projectDir = workspaceRoot.resolve(projectRelativePath).toFile();
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

        // 使用ProcessBuilder直接启动，因为我们只需要进程对象
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

    public CompletableFuture<Integer> runMavenBuild(String projectRelativePath) {
        var projectDir = workspaceRoot.resolve(projectRelativePath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            logService.sendMessage(BUILD_LOG_TOPIC, errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        // ==================== 关键修改点 START ====================
        // 原代码依赖于平台特定的 mvnw 或 mvnw.cmd 脚本，这在跨平台部署（尤其是在Docker中）时
        // 容易因文件权限或换行符格式问题而出错。
        // 新代码直接调用 'mvn' 命令，前提是运行环境（如Docker容器）中已安装Maven。
        // 这使得构建过程更健壮、更标准。
        List<String> mavenCommand = Arrays.asList("mvn", "clean", "install", "-U", "-Dfile.encoding=UTF-8");
        // ==================== 关键修改点 END ======================

        logService.sendMessage(BUILD_LOG_TOPIC, "Executing: " + String.join(" ", mavenCommand) + " in " + projectDir.getAbsolutePath());
        return commandExecutor.executeCommand(mavenCommand, projectDir,
                line -> logService.sendMessage(BUILD_LOG_TOPIC, line)
        );
    }

    public CompletableFuture<Integer> runJavaApplication(String projectRelativePath, String mainClass) {
        var projectDir = workspaceRoot.resolve(projectRelativePath).toFile();
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