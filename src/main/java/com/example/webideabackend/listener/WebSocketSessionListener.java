package com.example.webideabackend.listener;

import com.example.webideabackend.service.UserSessionService;
import com.example.webideabackend.service.WebSocketNotificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.Map;

@Component
@Slf4j
public class WebSocketSessionListener {

    private final UserSessionService userSessionService;
    private final WebSocketNotificationService notificationService;

    public WebSocketSessionListener(UserSessionService userSessionService, WebSocketNotificationService notificationService) {
        this.userSessionService = userSessionService;
        this.notificationService = notificationService;
    }

    /**
     * 监听 WebSocket 连接事件。
     */
    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        Principal user = headerAccessor.getUser();

        if (sessionId == null || user == null) {
            log.error("在 SessionConnectedEvent 中无法获取到 session ID 或 Principal。");
            return;
        }

        log.info("接收到新的 WebSocket 连接，会话 ID: {}，用户: {}", sessionId, user.getName());

        // 尝试获取锁
        if (!userSessionService.lock(sessionId)) {
            // 如果获取锁失败，说明应用已被占用
            log.warn("连接被拒绝：应用已被占用。向会话 {} 发送锁定状态。", sessionId);
            // 立即向这个被拒绝的用户发送一个特定的消息
            SimpMessageHeaderAccessor userHeaderAccessor = SimpMessageHeaderAccessor.create();
            userHeaderAccessor.setSessionId(sessionId);
            userHeaderAccessor.setUser(user);
            notificationService.sendMessage("/user/queue/session/status", "LOCKED");
        }
    }

    /**
     * 监听 WebSocket 断开事件。
     */
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId != null) {
            log.info("WebSocket 连接断开，会话 ID: {}", sessionId);
            // 尝试解锁
            userSessionService.unlock(sessionId);
        }
    }
}