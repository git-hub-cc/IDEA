/**
 * SettingsService.java
 *
 * 该服务是整个应用的配置中心，负责管理IDE的所有可配置项。
 * 已修改，不再管理AI相关的配置。
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
    // ========================= 删除 START =========================
    // private final String initialAiApiEndpoint;
    // private final String initialAiApiKey;
    // private final String initialAiModel;
    // ========================= 删除 END ===========================

    public SettingsService(
            @Value("${app.workspace-root}") String initialWorkspaceRoot,
            @Value("${app.maven.home:}") String initialMavenHome,
            @Value("#{${app.jdk.paths}}") Map<String, String> initialJdkPaths) {

        this.initialWorkspaceRoot = initialWorkspaceRoot;
        this.initialMavenHome = initialMavenHome;
        this.initialJdkPaths = initialJdkPaths;

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
        // ========================= 修改 START =========================
        // 确保从前端接收的设置对象中不会意外地包含AI字段，
        // 或者如果包含，也确保它们不会被保存到服务器的settings.json中。
        // （由于Settings类已修改，Jackson在反序列化时会自动忽略未知属性，
        // 但这里保留逻辑以明确意图）
        Settings settingsToSave = new Settings();
        settingsToSave.setWorkspaceRoot(newSettings.getWorkspaceRoot());
        settingsToSave.setMavenHome(newSettings.getMavenHome());
        settingsToSave.setJdkPaths(newSettings.getJdkPaths());
        settingsToSave.setTheme(newSettings.getTheme());
        settingsToSave.setFontSize(newSettings.getFontSize());
        settingsToSave.setEditorFontFamily(newSettings.getEditorFontFamily());
        settingsToSave.setWordWrap(newSettings.isWordWrap());

        this.currentSettings = settingsToSave;
        // ========================= 修改 END ===========================
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
        // AI相关默认值设置已移除
        return settings;
    }
}