/**
 * SettingsController.java
 *
 * 该控制器负责处理IDE设置的读取和更新请求。
 * 它通过 SettingsService 来获取和持久化配置。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.model.Settings;
import club.ppmc.idea.service.SettingsService;
import java.io.IOException;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
@Slf4j
public class SettingsController {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    /**
     * 获取当前的IDE设置。
     */
    @GetMapping
    public ResponseEntity<Settings> getSettings() {
        return ResponseEntity.ok(settingsService.getSettings());
    }

    /**
     * 更新并保存IDE设置。
     */
    @PostMapping
    public ResponseEntity<?> updateSettings(@RequestBody Settings newSettings) {
        try {
            settingsService.updateSettings(newSettings);
            return ResponseEntity.ok(Map.of("message", "设置更新成功。"));
        } catch (IOException e) {
            log.error("保存设置失败", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "保存设置失败: " + e.getMessage()));
        }
    }
}