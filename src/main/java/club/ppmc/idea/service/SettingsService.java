/**
 * SettingsService.java
 *
 * 该服务是整个应用的配置中心，负责管理IDE的所有可配置项。
 * 它处理配置的加载、更新和持久化，将配置信息以JSON格式存储在工作区的一个隐藏目录 (.ide) 中。
 * 在首次启动时，它会使用 application.properties 中的值作为默认设置来创建配置文件。
 * 所有其他需要配置的服务都应依赖此服务，而不是直接使用 @Value 注解。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.Settings;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SettingsService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SettingsService.class);
    private static final String SETTINGS_DIR = ".ide";
    private static final String SETTINGS_FILE_NAME = "settings.json";

    private final Path settingsFilePath;
    private final ObjectMapper objectMapper;
    private volatile Settings currentSettings;

    // --- 用于首次初始化的默认值 ---
    private final String initialWorkspaceRoot;
    private final String initialMavenHome;
    private final Map<String, String> initialJdkPaths;
    private final String initialGiteeToken;

    public SettingsService(
            @Value("${app.workspace-root}") String initialWorkspaceRoot,
            @Value("${app.maven.home:}") String initialMavenHome,
            @Value("#{${app.jdk.paths}}") Map<String, String> initialJdkPaths,
            @Value("${gitee.api.access-token:}") String initialGiteeToken) {

        this.initialWorkspaceRoot = initialWorkspaceRoot;
        this.initialMavenHome = initialMavenHome;
        this.initialJdkPaths = initialJdkPaths;
        this.initialGiteeToken = initialGiteeToken;

        // 设置文件的最终路径依赖于工作区路径，该路径本身也是可配置的。
        // 所以在init()中加载配置后，才能确定最终的 settingsFilePath。
        // 这里先用初始值确定一个临时路径。
        this.settingsFilePath =
                Paths.get(initialWorkspaceRoot, SETTINGS_DIR, SETTINGS_FILE_NAME)
                        .toAbsolutePath()
                        .normalize();
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    @PostConstruct
    public void init() {
        try {
            Path settingsDir = this.settingsFilePath.getParent();
            if (Files.notExists(settingsDir)) {
                Files.createDirectories(settingsDir);
            }
            if (Files.exists(this.settingsFilePath)) {
                loadSettings();
            } else {
                createAndSaveDefaultSettings();
            }
        } catch (IOException e) {
            LOGGER.error("初始化设置失败。将使用临时的默认设置。", e);
            this.currentSettings = createDefaultSettings();
        }
    }

    public synchronized Settings getSettings() {
        return this.currentSettings;
    }

    public synchronized void updateSettings(Settings newSettings) throws IOException {
        this.currentSettings = newSettings;
        saveSettings();
    }

    private void loadSettings() throws IOException {
        try {
            byte[] jsonData = Files.readAllBytes(settingsFilePath);
            this.currentSettings = objectMapper.readValue(jsonData, Settings.class);
            LOGGER.info("已成功从 {} 加载设置。", settingsFilePath);
        } catch (IOException e) {
            LOGGER.error("读取设置文件时出错。下次保存时将创建新的默认文件。", e);
            this.currentSettings = createDefaultSettings();
            throw e;
        }
    }

    private void saveSettings() throws IOException {
        // 获取最新的工作区路径来保存文件
        Path currentSettingsPath = Paths.get(currentSettings.getWorkspaceRoot(), SETTINGS_DIR, SETTINGS_FILE_NAME).toAbsolutePath().normalize();
        if (Files.notExists(currentSettingsPath.getParent())) {
            Files.createDirectories(currentSettingsPath.getParent());
        }

        try {
            byte[] jsonData = objectMapper.writeValueAsBytes(currentSettings);
            Files.write(currentSettingsPath, jsonData);
            LOGGER.info("已成功将设置保存到 {}", currentSettingsPath);
        } catch (IOException e) {
            LOGGER.error("将设置保存到文件 {} 时失败", currentSettingsPath, e);
            throw e;
        }
    }

    private void createAndSaveDefaultSettings() throws IOException {
        this.currentSettings = createDefaultSettings();
        saveSettings();
        LOGGER.info("未找到设置文件。已在 {} 创建了包含默认值的新文件。", settingsFilePath);
    }

    private Settings createDefaultSettings() {
        var settings = new Settings();
        settings.setWorkspaceRoot(this.initialWorkspaceRoot);
        if (StringUtils.hasText(this.initialMavenHome)) {
            settings.setMavenHome(this.initialMavenHome);
        }
        if (this.initialJdkPaths != null && !this.initialJdkPaths.isEmpty()) {
            settings.setJdkPaths(this.initialJdkPaths);
        }
        if (StringUtils.hasText(this.initialGiteeToken)) {
            settings.setGiteeAccessToken(this.initialGiteeToken);
        }
        return settings;
    }
}