/**
 * TerminalController.java
 *
 * 这是一个WebSocket控制器，专门处理与后端伪终端的交互。
 * 已修改，新增了对 `docker exec` 的支持。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.service.TerminalService;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.lang.Nullable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Controller
@Slf4j
public class TerminalController {

    private final TerminalService terminalService;

    public TerminalController(TerminalService terminalService) {
        this.terminalService = terminalService;
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId != null) {
            log.info("WebSocket 连接断开: {}. 正在清理终端会话。", sessionId);
            terminalService.endSession(sessionId);
        }
    }

    @MessageMapping("/terminal/start")
    public void startTerminal(
            @Payload(required = false) @Nullable String relativePath,
            SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            log.info("收到会话 {} 在路径 '{}' 下的系统终端启动请求", sessionId, relativePath);
            terminalService.startSession(sessionId, relativePath);
        }
    }

    @MessageMapping("/terminal/input")
    public void handleInput(@Payload String input, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.receiveInput(sessionId, input);
        }
    }

    /**
     * ========================= 新增 START: Docker Exec WebSocket 端点 =========================
     */
    @MessageMapping("/terminal/docker/start")
    public void startDockerTerminal(@Payload Map<String, String> payload, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String containerId = payload.get("containerId");
        if (sessionId != null && containerId != null && !containerId.isBlank()) {
            log.info("收到会话 {} 对容器 {} 的 Docker Exec 终端启动请求", sessionId, containerId);
            terminalService.startDockerExecSession(sessionId, containerId);
        } else {
            log.warn("收到无效的 Docker Exec 启动请求: sessionId={}, containerId={}", sessionId, containerId);
        }
    }

    @MessageMapping("/terminal/docker/input")
    public void handleDockerInput(@Payload String input, SimpMessageHeaderAccessor headerAccessor) {
        // 复用同一个处理方法，因为逻辑是相同的
        handleInput(input, headerAccessor);
    }
    /**
     * ========================= 新增 END =======================================================
     */
}