/**
 * JavaCompilerRunnerService.java
 *
 * 该服务负责编排Java项目的构建和运行流程。
 * 它强依赖于Maven，会执行Maven命令来编译和打包项目，然后运行生成的应用。
 * 它使用内置的JDK 17进行交叉编译，同时允许用户通过设置覆盖JDK，以提供最大的灵活性和开箱即用的体验。
 * 它与 RunSessionService 交互以启动和管理子进程，并通过 WebSocketNotificationService 发送实时日志。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.exception.EnvironmentConfigurationException;
import club.ppmc.idea.model.Settings;
import club.ppmc.idea.util.MavenProjectHelper;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;
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

    private void validatePreconditions(String projectPath, Settings settings) {
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        if (Files.notExists(projectDir.resolve("pom.xml"))) {
            throw new IllegalArgumentException(
                    "所选项目不是一个有效的Maven项目。运行功能当前仅支持标准的Maven项目（根目录必须包含pom.xml）。");
        }
        validateMavenHome(settings.getMavenHome());
    }

    public void initiateBuildAndRun(String projectPath, String mainClass) {
        notificationService.sendBuildLog("收到构建命令: " + projectPath);
        try {
            Settings settings = settingsService.getSettings();
            validatePreconditions(projectPath, settings);
            taskExecutor.submit(() -> executeBuildAndRunAsync(projectPath, mainClass, settings));
        } catch (IllegalArgumentException | EnvironmentConfigurationException e) {
            log.warn("为项目'{}'启动构建前验证失败: {}", projectPath, e.getMessage());
            notificationService.sendBuildLog("[错误] " + e.getMessage());
            if (e instanceof EnvironmentConfigurationException envEx) {
                notificationService.sendMessage("/topic/run/env-error", envEx.toErrorData());
            }
        }
    }

    private void executeBuildAndRunAsync(String projectPath, String mainClass, Settings settings) {
        try {
            // 阶段 1: 使用统一的帮助类来执行构建
            Path projectDir = getWorkspaceRoot().resolve(projectPath);
            String jdkVersionFromPom = mavenHelper.getJavaVersionFromPom(projectDir.toFile(), notificationService::sendBuildLog);
            String javaExecutable = mavenHelper.selectJdkExecutable(settings, jdkVersionFromPom, notificationService::sendBuildLog);

            List<String> mavenGoals = Arrays.asList("clean", "install", "dependency:copy-dependencies", "-U");
            int buildExitCode = mavenHelper.executeMavenBuild(projectPath, settings, mavenGoals);

            notificationService.sendBuildLog("构建完成，退出码: " + buildExitCode);

            if (buildExitCode == 0) {
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

    private void validateMavenHome(String mavenHome) {
        if (!StringUtils.hasText(mavenHome)) {
            throw new EnvironmentConfigurationException(
                    "Maven 主目录未配置。请前往“设置” -> “环境”进行配置。", "maven", null);
        }
        Path mavenHomePath = Paths.get(mavenHome);
        if (!Files.isDirectory(mavenHomePath)
                || !Files.isDirectory(mavenHomePath.resolve("boot"))
                || !Files.isDirectory(mavenHomePath.resolve("bin"))) {
            String message = String.format(
                    "提供的Maven主目录 '%s' 无效或不完整。请确保它指向一个有效的Maven安装目录（应包含bin和boot子目录）。", mavenHome);
            throw new EnvironmentConfigurationException(message, "maven", null);
        }
    }

    private void runJavaApplication(String projectPath, String mainClass, String javaExecutable) throws IOException {
        File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
        Path targetDir = projectDir.toPath().resolve("target");
        Path classesDir = targetDir.resolve("classes");
        Path dependencyDir = targetDir.resolve("dependency");

        if (!Files.isDirectory(classesDir)) {
            notificationService.sendRunLog("[错误] 未找到编译输出目录 'target/classes'。请确认 Maven 构建是否成功。");
            return;
        }

        List<String> classpathEntries = new ArrayList<>();
        classpathEntries.add(classesDir.toAbsolutePath().toString());

        if (Files.isDirectory(dependencyDir)) {
            try (Stream<Path> dependencyJars = Files.walk(dependencyDir)) {
                List<String> jarPaths = dependencyJars
                        .filter(path -> path.toString().endsWith(".jar"))
                        .map(path -> path.toAbsolutePath().toString())
                        .toList();
                classpathEntries.addAll(jarPaths);
            }
        }

        String classpath = String.join(File.pathSeparator, classpathEntries);

        List<String> commandList = new ArrayList<>();
        commandList.add(javaExecutable);
        commandList.add("-Dfile.encoding=UTF-8");
        commandList.add("-cp");
        commandList.add(classpath);
        commandList.add(mainClass);

        notificationService.sendRunLog("执行: " + String.join(" ", commandList));
        runSessionService.start(commandList, projectDir);
    }
}