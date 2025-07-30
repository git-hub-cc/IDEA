
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

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class SettingsService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SettingsService.class);
    private static final String SETTINGS_FILE_NAME = "settings.json";

    private final Path workspaceRoot;
    private final Path settingsFilePath;
    private final ObjectMapper objectMapper;
    private Settings currentSettings;

    public SettingsService(@Value("${app.workspace-root}") String workspaceRootPath) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
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
                this.currentSettings = new Settings(); // 使用默认设置
                saveSettings();
                LOGGER.info("No settings file found. Created a new one with default values at: {}", settingsFilePath);
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