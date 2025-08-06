package com.example.webideabackend.controller;

import com.example.webideabackend.service.UserSessionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/session")
public class SessionController {

    private final UserSessionService userSessionService;

    public SessionController(UserSessionService userSessionService) {
        this.userSessionService = userSessionService;
    }

    /**
     * 检查当前会话状态。
     * @return 一个包含 'isLocked' 状态的 JSON 对象。
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Boolean>> getSessionStatus() {
        return ResponseEntity.ok(Map.of("isLocked", userSessionService.isLocked()));
    }
}