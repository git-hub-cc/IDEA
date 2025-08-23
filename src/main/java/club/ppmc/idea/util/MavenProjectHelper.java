/**
 * MavenProjectHelper.java
 *
 * 这是一个帮助类，用于处理与Maven项目相关的常见操作，如解析pom.xml文件。
 * 它被设计为无状态的组件，可以被多个服务（如JavaCompilerRunnerService）注入和使用。
 */
package club.ppmc.idea.util;

import club.ppmc.idea.model.Settings;
import club.ppmc.idea.service.SettingsService;
import club.ppmc.idea.service.WebSocketNotificationService;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.apache.maven.model.Model;
import org.apache.maven.model.io.xpp3.MavenXpp3Reader;
import org.codehaus.plexus.util.xml.pull.XmlPullParserException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class MavenProjectHelper {

    private static final Logger LOGGER = LoggerFactory.getLogger(MavenProjectHelper.class);
    private static final String DEFAULT_JAVA_VERSION = "17";
    private static final boolean IS_WINDOWS = System.getProperty("os.name").toLowerCase().contains("win");

    private final SettingsService settingsService;
    private final WebSocketNotificationService notificationService;

    public MavenProjectHelper(SettingsService settingsService, WebSocketNotificationService notificationService) {
        this.settingsService = settingsService;
        this.notificationService = notificationService;
    }

    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    /**
     * 从项目的 pom.xml 文件中解析 Java 版本。
     */
    public String getJavaVersionFromPom(File projectDir, Consumer<String> logConsumer) {
        File pomFile = new File(projectDir, "pom.xml");
        if (!pomFile.exists()) {
            String warning = String.format(
                    "信息: 在 %s 中未找到 pom.xml。将默认使用 JDK %s。",
                    projectDir.getAbsolutePath(), DEFAULT_JAVA_VERSION);
            LOGGER.warn(warning);
            if (logConsumer != null) {
                logConsumer.accept(warning);
            }
            return DEFAULT_JAVA_VERSION;
        }

        MavenXpp3Reader reader = new MavenXpp3Reader();
        try (var fileReader = new FileReader(pomFile, StandardCharsets.UTF_8)) {
            Model model = reader.read(fileReader);

            String javaVersion = model.getProperties().getProperty("java.version");
            if (javaVersion != null && !javaVersion.isBlank()) {
                logVersion("java.version", javaVersion, logConsumer);
                return normalizeJavaVersion(javaVersion);
            }

            String sourceVersion = model.getProperties().getProperty("maven.compiler.source");
            if (sourceVersion != null && !sourceVersion.isBlank()) {
                logVersion("maven.compiler.source", sourceVersion, logConsumer);
                return normalizeJavaVersion(sourceVersion);
            }

            String releaseVersion = model.getProperties().getProperty("maven.compiler.release");
            if (releaseVersion != null && !releaseVersion.isBlank()) {
                logVersion("maven.compiler.release", releaseVersion, logConsumer);
                return normalizeJavaVersion(releaseVersion);
            }

            String warning = String.format(
                    "信息: 在 pom.xml 中未找到指定的Java版本。将默认使用 JDK %s 进行执行。",
                    DEFAULT_JAVA_VERSION);
            LOGGER.warn(warning);
            if (logConsumer != null) {
                logConsumer.accept(warning);
            }
            return DEFAULT_JAVA_VERSION;

        } catch (IOException | XmlPullParserException e) {
            String error = String.format(
                    "错误: 解析 %s 中的 pom.xml 失败。将默认使用 JDK %s。",
                    projectDir.getAbsolutePath(), DEFAULT_JAVA_VERSION);
            LOGGER.error(error, e);
            if (logConsumer != null) {
                logConsumer.accept(error);
            }
            return DEFAULT_JAVA_VERSION;
        }
    }

    private void logVersion(String property, String version, Consumer<String> logConsumer) {
        String info = String.format("信息: 从 <%s> 属性中检测到 Java 版本 '%s'。", property, version);
        LOGGER.info(info);
        if (logConsumer != null) {
            logConsumer.accept(info);
        }
    }

    private String normalizeJavaVersion(String version) {
        if (version.startsWith("1.")) {
            return version.substring(2);
        }
        return version;
    }

    /**
     * 执行Maven构建，并将输出实时流式传输到前端。 (阶段 1 & 3)
     */
    public int executeMavenBuild(String projectPath, Settings settings, List<String> goals) {
        try {
            File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
            String mavenHome = settings.getMavenHome();
            String targetReleaseVersion = getJavaVersionFromPom(projectDir, notificationService::sendBuildLog);
            String javaExecutable = selectJdkExecutable(settings, targetReleaseVersion, notificationService::sendBuildLog);

            Path bootDir = Paths.get(mavenHome, "boot");
            File plexusJar;
            try (var stream = Files.list(bootDir)) {
                plexusJar = stream
                        .map(Path::toFile)
                        .filter(file -> file.getName().startsWith("plexus-classworlds") && file.getName().endsWith(".jar"))
                        .findFirst()
                        .orElseThrow(() -> new IOException("在 " + bootDir + " 中找不到 plexus-classworlds JAR。请检查Maven主目录配置。"));
            }

            List<String> command = new ArrayList<>();
            command.add(javaExecutable);
            command.add("-cp");
            command.add(plexusJar.getAbsolutePath());
            command.add("-Dclassworlds.conf=" + Paths.get(mavenHome, "bin", "m2.conf").toAbsolutePath());
            command.add("-Dmaven.home=" + mavenHome);
            command.add("-Dfile.encoding=UTF-8");
            command.add("-Dmaven.multiModuleProjectDirectory=" + projectDir.getAbsolutePath());
            command.add("-Dmaven.compiler.release=" + targetReleaseVersion);
            command.add("org.codehaus.plexus.classworlds.launcher.Launcher");
            command.addAll(goals);

            notificationService.sendBuildLog(
                    "执行: " + String.join(" ", command) + " 于 " + projectDir.getAbsolutePath());

            var pb = new ProcessBuilder(command).directory(projectDir).redirectErrorStream(true);
            Process process = pb.start();

            try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                reader.lines().forEach(notificationService::sendBuildLog);
            }

            return process.waitFor();
        } catch (IOException | InterruptedException e) {
            LOGGER.error("执行Maven构建失败", e);
            notificationService.sendBuildLog("[致命错误] Maven构建过程失败: " + e.getMessage());
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return -1;
        }
    }

    /**
     * 根据优先级选择要使用的JDK可执行文件。
     */
    public String selectJdkExecutable(Settings settings, String requiredVersion, Consumer<String> logConsumer) {
        String lookupKey = "jdk" + requiredVersion;
        String userDefinedJdkPath = settings.getJdkPaths().get(lookupKey);
        if (StringUtils.hasText(userDefinedJdkPath) && Files.isExecutable(Paths.get(userDefinedJdkPath))) {
            String msg = String.format("信息: 找到并使用用户为 JDK %s 配置的路径: %s", requiredVersion, userDefinedJdkPath);
            LOGGER.info(msg);
            if (logConsumer != null) logConsumer.accept(msg);
            return userDefinedJdkPath;
        }

        try {
            Path javaHome = Paths.get(System.getProperty("java.home"));
            Path backendJdkExecutable = IS_WINDOWS ? javaHome.resolve("bin/java.exe") : javaHome.resolve("bin/java");
            if (Files.isExecutable(backendJdkExecutable)) {
                String msg = String.format("信息: 未找到用户为 JDK %s 配置的有效路径。将回退到使用后端内置的 JDK 17 进行编译。", requiredVersion);
                LOGGER.info(msg);
                if (logConsumer != null) logConsumer.accept(msg);
                return backendJdkExecutable.toAbsolutePath().toString();
            }
        } catch (Exception e) {
            LOGGER.warn("无法定位后端内置JDK，将尝试系统PATH。", e);
        }

        String msg = "警告: 无法找到任何已配置的或内置的JDK。将回退到使用系统PATH中的'java'命令。这可能导致不可预知的行为。";
        LOGGER.warn(msg);
        if (logConsumer != null) logConsumer.accept(msg);
        return "java";
    }
}