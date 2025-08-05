package com.example.webideabackend.service;

import com.example.webideabackend.util.MavenProjectHelper;
// import com.example.webideabackend.util.SystemCommandExecutor; // 不再需要
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
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
// import java.util.concurrent.CompletableFuture; // runJavaApplication 的返回类型会改变

@Service
@Slf4j
public class JavaCompilerRunnerService {

    private final Path workspaceRoot;
    // private final SystemCommandExecutor commandExecutor; // 移除
    private final WebSocketNotificationService notificationService;
    private final MavenProjectHelper mavenHelper;
    private final RunSessionService runSessionService; // 新增依赖

    @Value("#{${app.jdk.paths}}")
    private Map<String, String> jdkPaths;

    private static final String MAIN_CLASS = "com.example.Main";

    @Autowired
    public JavaCompilerRunnerService(
            @Value("${app.workspace-root}") String workspaceRootPath,
            // SystemCommandExecutor commandExecutor, // 移除
            WebSocketNotificationService notificationService,
            MavenProjectHelper mavenHelper,
            RunSessionService runSessionService) { // 新增依赖
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        // this.commandExecutor = commandExecutor; // 移除
        this.notificationService = notificationService;
        this.mavenHelper = mavenHelper;
        this.runSessionService = runSessionService; // 新增依赖
    }

    public void validateIsMavenProject(String projectPath) {
        // ... 此方法保持不变 ...
        Path projectDir = workspaceRoot.resolve(projectPath);
        Path pomFile = projectDir.resolve("pom.xml");
        if (!Files.exists(pomFile)) {
            String errorMessage = "The selected project is not a valid Maven project. The 'Run' feature currently only supports standard Maven projects (must contain a pom.xml at the root).";
            log.warn("Validation failed for project '{}': {}", projectPath, errorMessage);
            notificationService.sendBuildLog("[ERROR] " + errorMessage);
            throw new IllegalArgumentException(errorMessage);
        }
    }

    // ========================= 关键修改 START =========================
    // 这个方法现在是异步的，但它不直接返回 CompletableFuture 了
    public void buildAndRunProject(String projectPath) {
        notificationService.sendBuildLog("Build command received for: " + projectPath);

        // 使用 CompletableFuture 来链式执行构建和运行
        CompletableFuture.runAsync(() -> {
            try {
                final String jdkVersion = mavenHelper.getJavaVersionFromPom(
                        workspaceRoot.resolve(projectPath).toFile(),
                        (logLine) -> notificationService.sendBuildLog(logLine)
                );

                // 同步执行 Maven 构建
                int buildExitCode = runMavenBuild(projectPath);
                notificationService.sendBuildLog("Build finished with exit code: " + buildExitCode);

                if (buildExitCode == 0) {
                    notificationService.sendRunLog("Build successful. Initiating run for main class: " + MAIN_CLASS);
                    // 构建成功后，调用 runJavaApplication
                    runJavaApplication(projectPath, MAIN_CLASS, jdkVersion);
                } else {
                    notificationService.sendRunLog("Build failed. Skipping run.");
                }
            } catch (Exception e) {
                log.error("Build and run process failed for project '{}'", projectPath, e);
                notificationService.sendBuildLog("[FATAL] Build failed with exception: " + e.getMessage());
            }
        });
    }

    // runJavaApplication 现在不再返回 Future，而是直接调用 RunSessionService
    public void runJavaApplication(String projectPath, String mainClass, String jdkVersion) {
        var projectDir = workspaceRoot.resolve(projectPath).toFile();
        List<String> commandList = buildJavaCommandList(projectDir, mainClass, "", jdkVersion);

        if (commandList == null) {
            notificationService.sendRunLog("Error: No compiled artifacts found. Please build the project first.");
            return;
        }

        notificationService.sendRunLog("Executing: " + String.join(" ", commandList));

        // 委托给 RunSessionService 执行
        runSessionService.start(commandList, projectDir);
    }
    // ========================= 关键修改 END ===========================


    private List<String> buildJavaCommandList(File projectDir, String mainClass, String jvmOptions, String jdkVersionKey) {
        // ... 此方法保持不变 ...
        var targetDir = new File(projectDir, "target");
        String jarFileName = getJarNameFromPom(projectDir);
        var jarFile = new File(targetDir, jarFileName);
        var classesDir = new File(targetDir, "classes");
        String effectiveClassPath;

        String mainClassName = mainClass;
        if (jarFile.exists()) {
            effectiveClassPath = jarFile.getAbsolutePath();
            mainClassName = ""; // Main-Class is in MANIFEST.MF when using -jar
        } else if (classesDir.exists()) {
            effectiveClassPath = classesDir.getAbsolutePath();
        } else {
            return null;
        }

        String javaExecutable = "java";
        boolean foundConfiguredJdk = false;

        if (jdkVersionKey != null) {
            String lookupKey = "jdk" + jdkVersionKey;
            if (jdkPaths.containsKey(lookupKey)) {
                String configuredPath = jdkPaths.get(lookupKey);
                if (new File(configuredPath).canExecute()) {
                    javaExecutable = configuredPath;
                    foundConfiguredJdk = true;
                } else {
                    log.warn("Path for JDK '{}' (key: '{}') is configured but not executable: {}.", jdkVersionKey, lookupKey, configuredPath);
                }
            }
        }

        if (!foundConfiguredJdk) {
            String reason = (jdkVersionKey == null) ? "not specified in pom.xml" :
                    String.format("specified as JDK '%s' in pom.xml, but no matching/valid path was found in application configuration", jdkVersionKey);
            String logMessage = String.format("INFO: JDK version was %s. Falling back to the system's default 'java' command. Please ensure it is compatible.", reason);
            notificationService.sendBuildLog(logMessage);
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

    // ========================= 关键修改 START =========================
    // runMavenBuild 现在返回 int (退出码)，而不是 Future
    public int runMavenBuild(String projectPath) throws IOException, InterruptedException {
        var projectDir = workspaceRoot.resolve(projectPath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            notificationService.sendBuildLog(errorMessage);
            return -1;
        }

        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        String mvnCommandName = isWindows ? "mvn.cmd" : "mvn";
        List<String> mavenCommand = Arrays.asList(mvnCommandName, "clean", "install", "-U", "-Dfile.encoding=UTF-8");

        notificationService.sendBuildLog("Executing: " + String.join(" ", mavenCommand) + " in " + projectDir.getAbsolutePath());

        // 直接执行并等待结果
        ProcessBuilder pb = new ProcessBuilder(mavenCommand).directory(projectDir).redirectErrorStream(true);
        Process process = pb.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            reader.lines().forEach(line -> notificationService.sendBuildLog(line));
        }

        return process.waitFor();
    }
    // ========================= 关键修改 END ===========================

    private String getJarNameFromPom(File projectDir) {
        // ... 此方法保持不变 ...
        File pomFile = new File(projectDir, "pom.xml");
        String fallbackJarName = projectDir.getName() + "-1.0-SNAPSHOT.jar";

        if (!pomFile.exists()) {
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
            if (version == null && model.getParent() != null) version = model.getParent().getVersion();
            if (artifactId == null || version == null) return fallbackJarName;
            return String.format("%s-%s.jar", artifactId, version);
        } catch (IOException | XmlPullParserException e) {
            log.error("Failed to parse pom.xml in {}. Falling back to default jar name.", projectDir.getAbsolutePath(), e);
            return fallbackJarName;
        }
    }
}