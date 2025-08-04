package com.example.webideabackend.controller;

import com.example.webideabackend.service.TerminalService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired
    public TerminalController(TerminalService terminalService) {
        this.terminalService = terminalService;
    }

    /**
     * Listens for WebSocket disconnection events and cleans up the corresponding terminal session.
     * @param event The disconnect event object.
     */
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId != null) {
            log.info("WebSocket disconnected: {}. Cleaning up terminal session.", sessionId);
            terminalService.endSession(sessionId);
        }
    }

    /**
     * Handles a request from the frontend to start a new terminal session.
     * The payload (projectPath) is optional.
     * @param projectPath The project context to start the terminal in (can be null or empty).
     * @param headerAccessor The message header accessor to get the session ID.
     */
    @MessageMapping("/terminal/start")
    public void startTerminal(@Payload(required = false) @Nullable String projectPath, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.startSession(sessionId, projectPath);
        }
    }

    /**
     * Handles input from the frontend terminal.
     * @param input The user-typed string.
     * @param headerAccessor The message header accessor to get the session ID.
     */
    @MessageMapping("/terminal/input")
    public void handleInput(@Payload String input, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.receiveInput(sessionId, input);
        }
    }
}