/**
 * SettingsService.java
 *
 * 该服务负责管理IDE的配置。它处理配置的加载和持久化，
 * 将配置信息以JSON格式存储在工作区的一个隐藏目录中。
 */
package com.example.webideabackend.service;

import com.example.webideabackend.model.Settings;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
// ========================= 关键修改 START =========================
import java.util.Map;
// ========================= 关键修改 END ===========================

@Service
public class SettingsService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SettingsService.class);
    private static final String SETTINGS_FILE_NAME = "settings.json";

    private final Path workspaceRoot;
    private final Path settingsFilePath;
    private final ObjectMapper objectMapper;
    private Settings currentSettings;

    // ========================= 关键修改 START: 注入 Maven 和 JDK 的初始配置 =========================
    private final String initialMavenHome;
    private final Map<String, String> initialJdkPaths;

    public SettingsService(@Value("${app.workspace-root}") String workspaceRootPath,
                           @Value("${app.maven.home:}") String initialMavenHome,
                           @Value("#{${app.jdk.paths}}") Map<String, String> initialJdkPaths) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        this.initialMavenHome = initialMavenHome;
        this.initialJdkPaths = initialJdkPaths;
        // ========================= 关键修改 END =================================================

        Path ideDir = this.workspaceRoot.resolve(".ide");
        this.settingsFilePath = ideDir.resolve(SETTINGS_FILE_NAME);
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    /**
     * 在服务初始化时加载设置。如果设置文件不存在，则创建并使用默认设置。
     */
    @PostConstruct
    public void init() {
        try {
            if (Files.notExists(settingsFilePath.getParent())) {
                Files.createDirectories(settingsFilePath.getParent());
            }
            if (Files.exists(settingsFilePath)) {
                loadSettings();
            } else {
                // ========================= 关键修改 START: 创建时填充初始配置 =========================
                this.currentSettings = new Settings(); // 使用默认设置

                // 如果 application.properties 中有配置，则用它们填充初始的 settings.json
                if (StringUtils.hasText(this.initialMavenHome)) {
                    this.currentSettings.setMavenHome(this.initialMavenHome);
                }
                if (this.initialJdkPaths != null && !this.initialJdkPaths.isEmpty()) {
                    this.currentSettings.setJdkPaths(this.initialJdkPaths);
                }

                saveSettings();
                LOGGER.info("No settings file found. Created a new one with initial values from application.properties at: {}", settingsFilePath);
                // ========================= 关键修改 END ========================================
            }
        } catch (IOException e) {
            LOGGER.error("Failed to initialize settings. Using default settings.", e);
            this.currentSettings = new Settings();
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
            LOGGER.info("Settings loaded successfully from {}", settingsFilePath);
        } catch (IOException e) {
            LOGGER.error("Error reading settings file. A new default file will be created on next save.", e);
            this.currentSettings = new Settings();
            throw e;
        }
    }

    private void saveSettings() throws IOException {
        try {
            byte[] jsonData = objectMapper.writeValueAsBytes(currentSettings);
            Files.write(settingsFilePath, jsonData);
            LOGGER.info("Settings saved successfully to {}", settingsFilePath);
        } catch (IOException e) {
            LOGGER.error("Failed to save settings to file {}", settingsFilePath, e);
            throw e;
        }
    }
}