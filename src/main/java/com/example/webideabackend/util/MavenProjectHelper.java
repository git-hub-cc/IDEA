package com.example.webideabackend.util;

import org.apache.maven.model.Model;
import org.apache.maven.model.io.xpp3.MavenXpp3Reader;
import org.codehaus.plexus.util.xml.pull.XmlPullParserException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.function.Consumer;

/**
 * 一个帮助类，用于处理与Maven项目相关的常见操作，如解析pom.xml。
 */
@Component
public class MavenProjectHelper {

    private static final Logger LOGGER = LoggerFactory.getLogger(MavenProjectHelper.class);
    private static final String DEFAULT_JAVA_VERSION = "17";

    /**
     * 从项目的 pom.xml 文件中解析 Java 版本。
     * 它会按以下顺序查找：
     * 1. <properties><java.version>
     * 2. <properties><maven.compiler.source>
     * 如果都找不到，则返回默认版本。
     *
     * @param projectDir 项目的根目录。
     * @param logConsumer 一个用于发送日志到前端的消费者 (可选)。
     * @return 规范化后的Java版本字符串 (例如 "8", "11", "17")。
     */
    public String getJavaVersionFromPom(File projectDir, Consumer<String> logConsumer) {
        File pomFile = new File(projectDir, "pom.xml");
        if (!pomFile.exists()) {
            String warning = String.format("INFO: pom.xml not found in %s. Defaulting to JDK %s.", projectDir.getAbsolutePath(), DEFAULT_JAVA_VERSION);
            LOGGER.warn(warning);
            if (logConsumer != null) logConsumer.accept(warning);
            return DEFAULT_JAVA_VERSION;
        }

        MavenXpp3Reader reader = new MavenXpp3Reader();
        try (FileReader fileReader = new FileReader(pomFile, StandardCharsets.UTF_8)) {
            Model model = reader.read(fileReader);

            // 优先检查 <java.version>
            String javaVersion = model.getProperties().getProperty("java.version");
            if (javaVersion != null && !javaVersion.isBlank()) {
                String info = "INFO: Using Java version '" + javaVersion + "' from <java.version> property.";
                LOGGER.info(info);
                if (logConsumer != null) logConsumer.accept(info);
                return normalizeJavaVersion(javaVersion);
            }

            // 其次检查 <maven.compiler.source>
            String sourceVersion = model.getProperties().getProperty("maven.compiler.source");
            if (sourceVersion != null && !sourceVersion.isBlank()) {
                String info = "INFO: Using Java version '" + sourceVersion + "' from <maven.compiler.source> property.";
                LOGGER.info(info);
                if (logConsumer != null) logConsumer.accept(info);
                return normalizeJavaVersion(sourceVersion);
            }

            // 回退到默认值
            String warning = String.format("INFO: No specific Java version found in pom.xml. Defaulting to JDK %s for execution.", DEFAULT_JAVA_VERSION);
            LOGGER.warn(warning);
            if (logConsumer != null) logConsumer.accept(warning);
            return DEFAULT_JAVA_VERSION;

        } catch (IOException | XmlPullParserException e) {
            String error = String.format("ERROR: Failed to parse pom.xml in %s. Defaulting to JDK %s.", projectDir.getAbsolutePath(), DEFAULT_JAVA_VERSION);
            LOGGER.error(error, e);
            if (logConsumer != null) logConsumer.accept(error);
            return DEFAULT_JAVA_VERSION;
        }
    }

    /**
     * 规范化Java版本字符串。
     * 例如，将 "1.8" 转换为 "8"。
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