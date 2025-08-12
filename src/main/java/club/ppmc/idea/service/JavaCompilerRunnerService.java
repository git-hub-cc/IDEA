/**
 * JavaCompilerRunnerService.java
 *
 * 该服务负责编排Java项目的构建和运行流程。
 * 它强依赖于Maven，会执行Maven命令来编译和打包项目，然后运行生成的应用。
 * 它严重依赖 SettingsService 来获取正确的Maven主目录和JDK路径，并进行严格的环境校验。
 * 它与 RunSessionService 交互以启动和管理子进程，并通过 WebSocketNotificationService 发送实时日志。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.exception.EnvironmentConfigurationException;
import club.ppmc.idea.model.Settings;
import club.ppmc.idea.util.MavenProjectHelper;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class JavaCompilerRunnerService {

    private final WebSocketNotificationService notificationService;
    private final MavenProjectHelper mavenHelper;
    private final RunSessionService runSessionService;
    private final SettingsService settingsService;
    private final ExecutorService taskExecutor = Executors.newSingleThreadExecutor();

    public JavaCompilerRunnerService(
            WebSocketNotificationService notificationService,
            MavenProjectHelper mavenHelper,
            RunSessionService runSessionService,
            SettingsService settingsService) {
        this.notificationService = notificationService;
        this.mavenHelper = mavenHelper;
        this.runSessionService = runSessionService;
        this.settingsService = settingsService;
    }

    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    /**
     * 同步验证项目和环境是否满足运行条件。
     * 如果验证失败，会直接抛出异常，阻止后续异步任务的提交。
     *
     * @param projectPath 要验证的项目路径。
     * @throws IllegalArgumentException 如果不是有效的Maven项目。
     * @throws EnvironmentConfigurationException 如果Maven或JDK环境未正确配置。
     */
    private void validatePreconditions(String projectPath, Settings settings) {
        // 验证1：是否是Maven项目
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        if (Files.notExists(projectDir.resolve("pom.xml"))) {
            throw new IllegalArgumentException(
                    "所选项目不是一个有效的Maven项目。运行功能当前仅支持标准的Maven项目（根目录必须包含pom.xml）。");
        }
        // 验证2：Maven和JDK环境是否配置
        validateMavenHome(settings.getMavenHome());
        String jdkVersion = mavenHelper.getJavaVersionFromPom(projectDir.toFile(), null);
        validateJdkPath(settings, jdkVersion);
    }

    /**
     * 启动一个异步的构建和运行流程。
     *
     * @param projectPath 要构建和运行的项目。
     */
    public void initiateBuildAndRun(String projectPath) {
        notificationService.sendBuildLog("收到构建命令: " + projectPath);
        try {
            Settings settings = settingsService.getSettings();
            // 先进行同步验证
            validatePreconditions(projectPath, settings);

            // 验证通过后，提交异步任务
            taskExecutor.submit(() -> executeBuildAndRunAsync(projectPath, settings));

        } catch (IllegalArgumentException | EnvironmentConfigurationException e) {
            log.warn("为项目'{}'启动构建前验证失败: {}", projectPath, e.getMessage());
            notificationService.sendBuildLog("[错误] " + e.getMessage());
            // 如果是环境配置错误，可以发送更结构化的信息
            if (e instanceof EnvironmentConfigurationException envEx) {
                notificationService.sendMessage("/topic/run/env-error", envEx.toErrorData());
            }
        }
    }

    private void executeBuildAndRunAsync(String projectPath, Settings settings) {
        try {
            // 在异步任务中再次获取配置，以确保它们是最新的
            String mvnExecutable = validateMavenHome(settings.getMavenHome());
            Path projectDir = getWorkspaceRoot().resolve(projectPath);
            String jdkVersion = mavenHelper.getJavaVersionFromPom(projectDir.toFile(), notificationService::sendBuildLog);
            String javaExecutable = validateJdkPath(settings, jdkVersion);

            // ========================= 关键修改 START: 获取JDK主目录并传递给构建方法 =========================
            // 从 java.exe/java 路径 (e.g., /path/to/jdk/bin/java) 推断出 JDK 的主目录
            Path jdkHome = Paths.get(javaExecutable).getParent().getParent();
            int buildExitCode = runMavenBuild(projectPath, mvnExecutable, jdkHome.toString());
            // ========================= 关键修改 END =======================================================

            notificationService.sendBuildLog("构建完成，退出码: " + buildExitCode);

            if (buildExitCode == 0) {
                String mainClass = "club.ppmc.Main"; // 假设主类固定
                notificationService.sendRunLog("构建成功。正在启动主类: " + mainClass);
                runJavaApplication(projectPath, mainClass, javaExecutable);
            } else {
                notificationService.sendRunLog("构建失败，已跳过运行。");
            }
        } catch (Exception e) {
            log.error("异步构建与运行流程为项目 '{}' 失败", projectPath, e);
            notificationService.sendBuildLog("[致命错误] 构建失败，发生异常: " + e.getMessage());
        }
    }

    private String validateMavenHome(String mavenHome) {
        if (!StringUtils.hasText(mavenHome)) {
            throw new EnvironmentConfigurationException(
                    "Maven 主目录未配置。请前往“设置” -> “环境”进行配置。", "maven", null);
        }
        String executableName = System.getProperty("os.name").toLowerCase().contains("win") ? "mvn.cmd" : "mvn";
        Path executablePath = Paths.get(mavenHome, "bin", executableName);

        if (!Files.isExecutable(executablePath)) {
            String message = String.format(
                    "在路径 %s 未找到Maven可执行文件或文件不可执行。请检查您的Maven主目录配置。", executablePath);
            throw new EnvironmentConfigurationException(message, "maven", null);
        }
        return executablePath.toAbsolutePath().toString();
    }

    private String validateJdkPath(Settings settings, String requiredVersion) {
        String lookupKey = "jdk" + requiredVersion;
        String javaExecutablePath = settings.getJdkPaths().get(lookupKey);

        if (!StringUtils.hasText(javaExecutablePath)) {
            String message = String.format(
                    "项目中指定的 JDK 版本 '%s' 未在设置中配置。请前往“设置” -> “环境”添加一个标识符为 '%s' 的 JDK 路径。", requiredVersion, lookupKey);
            throw new EnvironmentConfigurationException(message, "jdk", requiredVersion);
        }

        if (!Files.isExecutable(Paths.get(javaExecutablePath))) {
            String message = String.format(
                    "为 JDK '%s' (标识符: '%s') 配置的路径无效或不可执行：%s。请在设置中更正。", requiredVersion, lookupKey, javaExecutablePath);
            throw new EnvironmentConfigurationException(message, "jdk", requiredVersion);
        }
        return javaExecutablePath;
    }

    private void runJavaApplication(String projectPath, String mainClass, String javaExecutable) {
        File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();

        // 查找可执行的JAR包
        File targetDir = new File(projectDir, "target");
        File[] jarFiles = targetDir.listFiles((dir, name) -> name.endsWith(".jar") && !name.contains("-sources.jar") && !name.contains("-javadoc.jar"));

        if (jarFiles == null || jarFiles.length == 0) {
            notificationService.sendRunLog("[错误] 在 'target' 目录中未找到可执行的 JAR 包。请确认 Maven 构建是否生成了 JAR。");
            return;
        }

        // 通常只有一个主JAR包，我们取第一个
        File jarFile = jarFiles[0];
        notificationService.sendRunLog("[信息] 找到并准备运行JAR包: " + jarFile.getName());

        List<String> commandList = new ArrayList<>();
        commandList.add(javaExecutable);
        commandList.add("-Dfile.encoding=UTF-8"); // 确保统一的编码
        commandList.add("-jar");
        commandList.add(jarFile.getAbsolutePath());

        notificationService.sendRunLog("执行: " + String.join(" ", commandList));
        runSessionService.start(commandList, projectDir);
    }

    // ========================= 关键修改 START: 方法签名变更，并增加设置环境变量的逻辑 =========================
    private int runMavenBuild(String projectPath, String mvnExecutable, String jdkHome) throws IOException, InterruptedException {
        File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();

        List<String> mavenCommand = Arrays.asList(mvnExecutable, "clean", "install", "-U", "-Dfile.encoding=UTF-8");
        notificationService.sendBuildLog(
                "执行: " + String.join(" ", mavenCommand) + " 于 " + projectDir.getAbsolutePath());

        var pb = new ProcessBuilder(mavenCommand).directory(projectDir).redirectErrorStream(true);

        // 为 Maven 进程设置 JAVA_HOME 环境变量
        Map<String, String> env = pb.environment();
        env.put("JAVA_HOME", jdkHome);
        log.info("正在为 Maven 构建设置 JAVA_HOME: {}", jdkHome);
        notificationService.sendBuildLog("[信息] 使用 JDK: " + jdkHome);

        Process process = pb.start();
        // ========================= 关键修改 END =================================================================

        try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            reader.lines().forEach(notificationService::sendBuildLog);
        }
        return process.waitFor();
    }
}