package com.example.webideabackend.service;

import com.example.webideabackend.exception.EnvironmentConfigurationException;
import com.example.webideabackend.model.Settings;
import com.example.webideabackend.util.MavenProjectHelper;
import lombok.extern.slf4j.Slf4j;
import org.apache.maven.model.Model;
import org.apache.maven.model.io.xpp3.MavenXpp3Reader;
import org.codehaus.plexus.util.xml.pull.XmlPullParserException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
@Slf4j
public class JavaCompilerRunnerService {

    private final WebSocketNotificationService notificationService;
    private final MavenProjectHelper mavenHelper;
    private final RunSessionService runSessionService;
    private final SettingsService settingsService;
    private final ExecutorService taskExecutor = Executors.newSingleThreadExecutor();

    @Value("#{${app.jdk.paths}}")
    private Map<String, String> legacyJdkPaths;

    private static final String MAIN_CLASS = "com.example.Main";

    // ========================= 关键修改 START: 移除 @Value 注入 =========================
    @Autowired
    public JavaCompilerRunnerService(
            WebSocketNotificationService notificationService,
            MavenProjectHelper mavenHelper,
            RunSessionService runSessionService,
            SettingsService settingsService) {
        // 移除了 @Value("${app.workspace-root}") String workspaceRootPath 参数
        this.notificationService = notificationService;
        this.mavenHelper = mavenHelper;
        this.runSessionService = runSessionService;
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
    // ========================= 关键修改 END ============================================


    public void validateIsMavenProject(String projectPath) {
        // 使用动态路径获取
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        Path pomFile = projectDir.resolve("pom.xml");
        if (!Files.exists(pomFile)) {
            String errorMessage = "The selected project is not a valid Maven project. The 'Run' feature currently only supports standard Maven projects (must contain a pom.xml at the root).";
            log.warn("Validation failed for project '{}': {}", projectPath, errorMessage);
            notificationService.sendBuildLog("[ERROR] " + errorMessage);
            throw new IllegalArgumentException(errorMessage);
        }
    }

    public void initiateBuildAndRun(String projectPath) {
        notificationService.sendBuildLog("Build command received for: " + projectPath);

        Settings settings = settingsService.getSettings();

        final String mvnExecutable = validateMavenHome(settings.getMavenHome());
        // 使用动态路径获取
        final String jdkVersion = mavenHelper.getJavaVersionFromPom(
                getWorkspaceRoot().resolve(projectPath).toFile(),
                (logLine) -> notificationService.sendBuildLog(logLine)
        );
        final String javaExecutable = validateJdkPath(settings.getJdkPaths(), jdkVersion);

        taskExecutor.submit(() -> {
            executeBuildAndRunAsync(projectPath, mvnExecutable, javaExecutable);
        });
    }

    private void executeBuildAndRunAsync(String projectPath, String mvnExecutable, String javaExecutable) {
        try {
            int buildExitCode = runMavenBuild(projectPath, mvnExecutable);
            notificationService.sendBuildLog("Build finished with exit code: " + buildExitCode);

            if (buildExitCode == 0) {
                notificationService.sendRunLog("Build successful. Initiating run for main class: " + MAIN_CLASS);
                runJavaApplication(projectPath, MAIN_CLASS, javaExecutable);
            } else {
                notificationService.sendRunLog("Build failed. Skipping run.");
            }
        } catch (Exception e) {
            log.error("Async build and run process failed for project '{}'", projectPath, e);
            notificationService.sendBuildLog("[FATAL] Build failed with exception: " + e.getMessage());
        }
    }

    private String validateMavenHome(String mavenHome) {
        if (!StringUtils.hasText(mavenHome)) {
            throw new EnvironmentConfigurationException("Maven 主目录未配置。请前往“设置” -> “环境”进行配置。", "maven");
        }
        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        String executableName = isWindows ? "mvn.cmd" : "mvn";
        Path executablePath = Paths.get(mavenHome, "bin", executableName);

        if (!Files.exists(executablePath) || !Files.isExecutable(executablePath)) {
            String message = String.format("Maven 可执行文件在以下路径未找到或不可执行：%s。请检查 Maven 主目录配置。", executablePath);
            throw new EnvironmentConfigurationException(message, "maven");
        }
        return executablePath.toAbsolutePath().toString();
    }

    private String validateJdkPath(Map<String, String> jdkPathsMap, String requiredVersion) {
        String lookupKey = "jdk" + requiredVersion;
        Map<String, String> effectiveJdkPaths = (jdkPathsMap != null && !jdkPathsMap.isEmpty()) ? jdkPathsMap : this.legacyJdkPaths;

        if (effectiveJdkPaths == null || !effectiveJdkPaths.containsKey(lookupKey)) {
            String message = String.format("项目中指定的 JDK 版本 '%s' 未在设置中配置。请前往“设置” -> “环境”添加一个标识符为 '%s' 的 JDK 路径。", requiredVersion, lookupKey);
            throw new EnvironmentConfigurationException(message, "jdk", requiredVersion);
        }

        String javaExecutablePath = effectiveJdkPaths.get(lookupKey);
        if (!StringUtils.hasText(javaExecutablePath) || !Files.exists(Paths.get(javaExecutablePath)) || !Files.isExecutable(Paths.get(javaExecutablePath))) {
            String message = String.format("为 JDK '%s' (标识符: '%s') 配置的路径无效或不可执行：%s。请在设置中更正。", requiredVersion, lookupKey, javaExecutablePath);
            throw new EnvironmentConfigurationException(message, "jdk", requiredVersion);
        }

        return javaExecutablePath;
    }

    public void runJavaApplication(String projectPath, String mainClass, String javaExecutable) {
        // 使用动态路径获取
        var projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
        List<String> commandList = buildJavaCommandList(projectDir, mainClass, "", javaExecutable);

        if (commandList == null) {
            notificationService.sendRunLog("Error: No compiled artifacts found. Please build the project first.");
            return;
        }

        notificationService.sendRunLog("Executing: " + String.join(" ", commandList));
        runSessionService.start(commandList, projectDir);
    }

    private List<String> buildJavaCommandList(File projectDir, String mainClass, String jvmOptions, String javaExecutable) {
        var targetDir = new File(projectDir, "target");
        String jarFileName = getJarNameFromPom(projectDir);
        var jarFile = new File(targetDir, jarFileName);
        var classesDir = new File(targetDir, "classes");
        String effectiveClassPath;

        String mainClassName = mainClass;
        if (jarFile.exists()) {
            effectiveClassPath = jarFile.getAbsolutePath();
            mainClassName = "";
        } else if (classesDir.exists()) {
            effectiveClassPath = classesDir.getAbsolutePath();
        } else {
            return null;
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

    public int runMavenBuild(String projectPath, String mvnExecutable) throws IOException, InterruptedException {
        // 使用动态路径获取
        var projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            notificationService.sendBuildLog(errorMessage);
            return -1;
        }

        List<String> mavenCommand = Arrays.asList(mvnExecutable, "clean", "install", "-U", "-Dfile.encoding=UTF-8");
        notificationService.sendBuildLog("Executing: " + String.join(" ", mavenCommand) + " in " + projectDir.getAbsolutePath());

        ProcessBuilder pb = new ProcessBuilder(mavenCommand).directory(projectDir).redirectErrorStream(true);
        Process process = pb.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            reader.lines().forEach(line -> notificationService.sendBuildLog(line));
        }

        return process.waitFor();
    }

    private String getJarNameFromPom(File projectDir) {
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