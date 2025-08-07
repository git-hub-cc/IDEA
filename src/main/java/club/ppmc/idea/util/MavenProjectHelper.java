/**
 * MavenProjectHelper.java
 *
 * 这是一个帮助类，用于处理与Maven项目相关的常见操作，如解析pom.xml文件。
 * 它被设计为无状态的组件，可以被多个服务（如JavaCompilerRunnerService）注入和使用。
 */
package club.ppmc.idea.util;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import org.apache.maven.model.Model;
import org.apache.maven.model.io.xpp3.MavenXpp3Reader;
import org.codehaus.plexus.util.xml.pull.XmlPullParserException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class MavenProjectHelper {

    private static final Logger LOGGER = LoggerFactory.getLogger(MavenProjectHelper.class);
    private static final String DEFAULT_JAVA_VERSION = "17";

    /**
     * 从项目的 pom.xml 文件中解析 Java 版本。
     * 它会按以下顺序查找并返回第一个找到的版本：
     * 1. {@code <properties><java.version>}
     * 2. {@code <properties><maven.compiler.source>}
     * 3. {@code <properties><maven.compiler.release>}
     * 如果都找不到，则返回默认版本 "17"。
     *
     * @param projectDir 项目的根目录。
     * @param logConsumer 一个可选的消费者，用于将解析过程中的日志信息实时发送到前端。如果为null，则不发送。
     * @return 规范化后的Java版本字符串 (例如 "8", "11", "17")。
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

            // 检查顺序: java.version > maven.compiler.source > maven.compiler.release
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

            // 回退到默认值
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

    /**
     * 规范化Java版本字符串。
     * 例如，将 "1.8" 转换为 "8"，"11" 保持 "11"。
     *
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