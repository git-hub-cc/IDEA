/**
 * SessionController.java
 *
 * 该控制器用于提供有关用户会话状态的信息。
 * 主要用于前端检查当前应用是否已被其他用户锁定。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.service.UserSessionService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/session")
public class SessionController {

    private final UserSessionService userSessionService;

    public SessionController(UserSessionService userSessionService) {
        this.userSessionService = userSessionService;
    }

    /**
     * 检查当前会话状态。
     *
     * @return 一个包含 'isLocked' 状态的JSON对象。
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Boolean>> getSessionStatus() {
        return ResponseEntity.ok(Map.of("isLocked", userSessionService.isLocked()));
    }
}