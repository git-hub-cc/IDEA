package com.example.webideabackend.service;

import com.example.webideabackend.util.SystemCommandExecutor;
import lombok.extern.slf4j.Slf4j;
import org.apache.maven.model.Model;
import org.apache.maven.model.io.xpp3.MavenXpp3Reader;
import org.codehaus.plexus.util.xml.pull.XmlPullParserException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
@Slf4j
public class JavaCompilerRunnerService {

    private final Path workspaceRoot;
    private final SystemCommandExecutor commandExecutor;
    private final WebSocketLogService logService;

    @Value("#{${app.jdk.paths}}")
    private Map<String, String> jdkPaths;

    private static final String BUILD_LOG_TOPIC = "/topic/build-log";
    private static final String RUN_LOG_TOPIC = "/topic/run-log";
    private static final String DEBUG_LOG_TOPIC = "/topic/debug-events";
    private static final String MAIN_CLASS = "com.example.Main"; // 假设一个默认主类

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

    /**
     * 核心业务逻辑：构建并运行项目。
     * 它会自动检测JDK版本，执行Maven构建，如果成功，则继续运行应用程序。
     * @param projectPath 项目路径。
     */
    public void buildAndRunProject(String projectPath) {
        logService.sendMessage(BUILD_LOG_TOPIC, "Build command received for: " + projectPath);

        // 1. 从 pom.xml 确定JDK版本
        final String jdkVersion = getJavaVersionFromPom(new File(workspaceRoot.resolve(projectPath).toUri()));

        // 2. 运行Maven构建
        runMavenBuild(projectPath)
                .thenAccept(exitCode -> {
                    logService.sendMessage(BUILD_LOG_TOPIC, "Build finished with exit code: " + exitCode);
                    if (exitCode == 0) {
                        // 3. 如果构建成功，使用确定的JDK版本运行应用
                        logService.sendMessage(RUN_LOG_TOPIC, "Build successful. Initiating run for main class: " + MAIN_CLASS);
                        runJavaApplication(projectPath, MAIN_CLASS, jdkVersion)
                                .thenAccept(runExitCode ->
                                        logService.sendMessage(RUN_LOG_TOPIC, "Application finished with exit code: " + runExitCode))
                                .exceptionally(ex -> {
                                    logService.sendMessage(RUN_LOG_TOPIC, "Application run failed with exception: " + ex.getMessage());
                                    return null;
                                });
                    } else {
                        logService.sendMessage(RUN_LOG_TOPIC, "Build failed. Skipping run.");
                    }
                })
                .exceptionally(ex -> {
                    logService.sendMessage(BUILD_LOG_TOPIC, "Build failed with exception: " + ex.getMessage());
                    return null;
                });
    }


    public DebugLaunchResult launchForDebug(String projectPath, String mainClass) throws IOException {
        var projectDir = workspaceRoot.resolve(projectPath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            throw new IOException("Project directory not found: " + projectDir.getAbsolutePath());
        }

        int port = findFreePort();
        String jdwpOptions = String.format("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:%d", port);

        final String jdkVersion = getJavaVersionFromPom(projectDir);
        List<String> commandList = buildJavaCommandList(projectDir, mainClass, jdwpOptions, jdkVersion);
        if (commandList == null) {
            throw new IOException("No compiled artifacts found. Please build the project first.");
        }

        logService.sendMessage(DEBUG_LOG_TOPIC, "Starting debug session with command: " + String.join(" ", commandList));

        ProcessBuilder pb = new ProcessBuilder(commandList).directory(projectDir);
        return new DebugLaunchResult(pb.start(), port);
    }

    private List<String> buildJavaCommandList(File projectDir, String mainClass, String jvmOptions, String jdkVersionKey) {
        var targetDir = new File(projectDir, "target");
        String jarFileName = getJarNameFromPom(projectDir);
        var jarFile = new File(targetDir, jarFileName);
        var classesDir = new File(targetDir, "classes");
        String effectiveClassPath;

        String mainClassName = mainClass;
        if (jarFile.exists()) {
            effectiveClassPath = jarFile.getAbsolutePath();
        } else if (classesDir.exists()) {
            effectiveClassPath = classesDir.getAbsolutePath();
        } else {
            return null; // No compiled artifacts
        }

        if (jarFile.exists()) {
            mainClassName = "";
        }

        String javaExecutable = "java"; // 默认使用系统环境的java
        boolean foundConfiguredJdk = false;

        // ========================= 关键修改 START =========================
        // 尝试使用 pom.xml 中指定的版本在配置中查找JDK路径
        if (jdkVersionKey != null) {
            // 构造用于在 map 中查找的 key, 例如 "8" -> "jdk8"
            String lookupKey = "jdk" + jdkVersionKey;
            if (jdkPaths.containsKey(lookupKey)) {
                String configuredPath = jdkPaths.get(lookupKey);
                if (new File(configuredPath).canExecute()) {
                    javaExecutable = configuredPath;
                    foundConfiguredJdk = true;
                    String logMessage = String.format("INFO: Using JDK %s as specified in pom.xml (path: %s).", jdkVersionKey, configuredPath);
                    log.info(logMessage);
                    logService.sendMessage(BUILD_LOG_TOPIC, logMessage);
                } else {
                    log.warn("Path for JDK '{}' (key: '{}') is configured but not executable: {}.", jdkVersionKey, lookupKey, configuredPath);
                }
            }
        }
        // ========================= 关键修改 END ===========================

        // 如果没有找到明确配置的JDK路径，则记录回退信息
        if (!foundConfiguredJdk) {
            String reason = (jdkVersionKey == null) ? "not specified in pom.xml" :
                    String.format("specified as JDK '%s' in pom.xml, but no matching/valid path was found in application configuration", jdkVersionKey);

            String logMessage = String.format("INFO: JDK version was %s. Falling back to the system's default 'java' command. Please ensure it is compatible.", reason);
            log.info(logMessage);
            logService.sendMessage(BUILD_LOG_TOPIC, logMessage);
        }

        List<String> command = new ArrayList<>();
        command.add(javaExecutable);
        if (jvmOptions != null && !jvmOptions.isBlank()) {
            command.add(jvmOptions);
        }
        command.add("-Dfile.encoding=UTF-8");

        if (jarFile.exists()) {
            command.add("-jar");
            command.add(effectiveClassPath);
        } else {
            command.add("-cp");
            command.add(effectiveClassPath);
            command.add(mainClassName);
        }

        return command;
    }

    private static int findFreePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        }
    }

    public CompletableFuture<Integer> runMavenBuild(String projectPath) {
        var projectDir = workspaceRoot.resolve(projectPath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            logService.sendMessage(BUILD_LOG_TOPIC, errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        String mvnCommandName = isWindows ? "mvn.cmd" : "mvn";

        List<String> mavenCommand = Arrays.asList(
                mvnCommandName, "clean", "install", "-U", "-Dfile.encoding=UTF-8"
        );

        logService.sendMessage(BUILD_LOG_TOPIC, "Executing: " + String.join(" ", mavenCommand) + " in " + projectDir.getAbsolutePath());
        return commandExecutor.executeCommand(mavenCommand, projectDir,
                line -> logService.sendMessage(BUILD_LOG_TOPIC, line)
        );
    }

    public CompletableFuture<Integer> runJavaApplication(String projectPath, String mainClass, String jdkVersion) {
        var projectDir = workspaceRoot.resolve(projectPath).toFile();
        List<String> commandList = buildJavaCommandList(projectDir, mainClass, "", jdkVersion);

        if (commandList == null) {
            logService.sendMessage(RUN_LOG_TOPIC, "Error: No compiled artifacts found. Please build the project first.");
            return CompletableFuture.completedFuture(-1);
        }

        logService.sendMessage(RUN_LOG_TOPIC, "Executing: " + String.join(" ", commandList));
        return commandExecutor.executeCommand(commandList, projectDir,
                line -> logService.sendMessage(RUN_LOG_TOPIC, line)
        );
    }

    private String getJarNameFromPom(File projectDir) {
        File pomFile = new File(projectDir, "pom.xml");
        String fallbackJarName = projectDir.getName() + "-1.0-SNAPSHOT.jar";

        if (!pomFile.exists()) {
            log.warn("pom.xml not found in {}. Falling back to default jar name: {}", projectDir.getAbsolutePath(), fallbackJarName);
            return fallbackJarName;
        }

        MavenXpp3Reader reader = new MavenXpp3Reader();
        try (BufferedReader bufferedReader = Files.newBufferedReader(pomFile.toPath(), StandardCharsets.UTF_8)) {
            Model model = reader.read(bufferedReader);

            if (model.getBuild() != null && model.getBuild().getFinalName() != null) {
                return model.getBuild().getFinalName() + ".jar";
            }

            String artifactId = model.getArtifactId();
            String version = model.getVersion();

            if (version == null && model.getParent() != null) {
                version = model.getParent().getVersion();
            }

            if (artifactId == null || version == null) {
                log.warn("Could not determine artifactId or version from pom.xml in {}. Falling back.", projectDir.getAbsolutePath());
                return fallbackJarName;
            }

            return String.format("%s-%s.jar", artifactId, version);

        } catch (IOException | XmlPullParserException e) {
            log.error("Failed to parse pom.xml in {}. Falling back to default jar name.", projectDir.getAbsolutePath(), e);
            return fallbackJarName;
        }
    }

    private String getJavaVersionFromPom(File projectDir) {
        File pomFile = new File(projectDir, "pom.xml");
        String defaultVersion = "17"; // The fallback version

        if (!pomFile.exists()) {
            log.warn("pom.xml not found in {}. Defaulting to JDK {}.", projectDir.getAbsolutePath(), defaultVersion);
            logService.sendMessage(BUILD_LOG_TOPIC, "INFO: pom.xml not found. Defaulting to JDK " + defaultVersion + " for execution.");
            return defaultVersion;
        }

        MavenXpp3Reader reader = new MavenXpp3Reader();
        try (BufferedReader bufferedReader = Files.newBufferedReader(pomFile.toPath(), StandardCharsets.UTF_8)) {
            Model model = reader.read(bufferedReader);

            // 优先级 1: 检查 <java.version>
            String javaVersion = model.getProperties().getProperty("java.version");
            if (javaVersion != null && !javaVersion.isBlank()) {
                log.info("Found 'java.version' property in pom.xml: {}", javaVersion);
                logService.sendMessage(BUILD_LOG_TOPIC, "INFO: Using Java version '" + javaVersion + "' from <java.version> property.");
                return normalizeJavaVersion(javaVersion);
            }

            // 优先级 2: 检查 <maven.compiler.source>
            String sourceVersion = model.getProperties().getProperty("maven.compiler.source");
            if (sourceVersion != null && !sourceVersion.isBlank()) {
                log.info("Found 'maven.compiler.source' property in pom.xml: {}", sourceVersion);
                logService.sendMessage(BUILD_LOG_TOPIC, "INFO: Using Java version '" + sourceVersion + "' from <maven.compiler.source> property.");
                return normalizeJavaVersion(sourceVersion);
            }

            // 优先级 3: 回退到默认值
            log.warn("Neither 'java.version' nor 'maven.compiler.source' found in {}. Defaulting to JDK {}.", pomFile.getAbsolutePath(), defaultVersion);
            logService.sendMessage(BUILD_LOG_TOPIC, "INFO: No specific Java version found in pom.xml. Defaulting to JDK " + defaultVersion + " for execution.");
            return defaultVersion;

        } catch (IOException | XmlPullParserException e) {
            log.error("Failed to parse pom.xml in {}. Defaulting to JDK {}.", projectDir.getAbsolutePath(), defaultVersion, e);
            logService.sendMessage(BUILD_LOG_TOPIC, "ERROR: Failed to parse pom.xml. Defaulting to JDK " + defaultVersion + " for execution.");
            return defaultVersion;
        }
    }

    /**
     * 规范化Java版本字符串，例如将 "1.8" 转换为 "8"。
     * @param version 原始版本字符串。
     * @return 规范化后的版本字符串。
     */
    private String normalizeJavaVersion(String version) {
        if (version.startsWith("1.")) {
            return version.substring(2);
        }
        return version;
    }
}