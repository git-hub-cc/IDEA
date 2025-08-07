/**
 * WebSocketSessionListener.java
 *
 * 这是一个Spring事件监听器，负责处理WebSocket的连接和断开事件。
 * 它与 UserSessionService 紧密协作，在用户连接时尝试获取应用锁，在用户断开时释放锁，
 * 从而实现单用户会话控制。
 */
package club.ppmc.idea.listener;

import club.ppmc.idea.service.UserSessionService;
import club.ppmc.idea.service.WebSocketNotificationService;
import java.security.Principal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
@Slf4j
public class WebSocketSessionListener {

    private final UserSessionService userSessionService;
    private final WebSocketNotificationService notificationService;

    public WebSocketSessionListener(
            UserSessionService userSessionService, WebSocketNotificationService notificationService) {
        this.userSessionService = userSessionService;
        this.notificationService = notificationService;
    }

    /**
     * 监听 WebSocket 连接建立事件。
     * 当一个新客户端成功连接时，此方法被调用。
     */
    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        var headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        Principal user = headerAccessor.getUser();

        if (sessionId == null || user == null) {
            log.error("在 SessionConnectedEvent 中无法获取到 session ID 或 Principal。");
            return;
        }

        log.info("接收到新的 WebSocket 连接，会话 ID: {}，用户: {}", sessionId, user.getName());

        // 核心逻辑：尝试为新连接获取应用锁
        if (!userSessionService.lock(sessionId)) {
            // 如果获取锁失败，说明应用已被其他用户占用
            log.warn("连接被拒绝：应用已被占用。向会话 {} 发送锁定状态。", sessionId);
            // 立即向这个被拒绝的用户发送一个特定的消息，通知他应用已被锁定
            notificationService.sendMessage(
                    "/user/queue/session/status", "LOCKED");
        }
    }

    /**
     * 监听 WebSocket 连接断开事件。
     * 当一个客户端断开连接（无论是正常关闭还是意外掉线）时，此方法被调用。
     */
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId != null) {
            log.info("WebSocket 连接断开，会话 ID: {}", sessionId);
            // 核心逻辑：尝试释放该会话持有的锁
            userSessionService.unlock(sessionId);
        }
    }
}