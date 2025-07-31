package com.example.webideabackend.controller;

import com.example.webideabackend.service.TerminalService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Controller
@Slf4j
public class TerminalController {

    private final TerminalService terminalService;

    @Autowired
    public TerminalController(TerminalService terminalService) {
        this.terminalService = terminalService;
    }

    // ... handleWebSocketDisconnectListener remains the same ...
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId != null) {
            log.info("WebSocket disconnected: {}. Cleaning up terminal session.", sessionId);
            terminalService.endSession(sessionId);
        }
    }

    /**
     * 处理前端请求启动一个新的终端会话。
     *
     * @param projectPath    The project context to start the terminal in.
     * @param headerAccessor 消息头访问器，用于获取会话ID。
     */
    @MessageMapping("/terminal/start")
    public void startTerminal(@Payload String projectPath, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.startSession(sessionId, projectPath);
        }
    }

    // ... handleInput remains the same ...
    @MessageMapping("/terminal/input")
    public void handleInput(@Payload String input, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.receiveInput(sessionId, input);
        }
    }
}