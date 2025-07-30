
package com.example.webideabackend.controller;

import com.example.webideabackend.model.Settings;
import com.example.webideabackend.service.SettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final SettingsService settingsService;

    @Autowired
    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public ResponseEntity<Settings> getSettings() {
        return ResponseEntity.ok(settingsService.getSettings());
    }

    @PostMapping
    public ResponseEntity<?> updateSettings(@RequestBody Settings newSettings) {
        try {
            settingsService.updateSettings(newSettings);
            return ResponseEntity.ok().body("Settings updated successfully.");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to save settings: " + e.getMessage());
        }
    }
}