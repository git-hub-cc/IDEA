/**
 * TerminalController.java
 *
 * 该控制器处理与交互式终端相关的WebSocket消息。
 * 它管理终端会话的生命周期，并将前端输入路由到相应的后端shell进程。
 */
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

    /**
     * 当客户端断开WebSocket连接时，结束对应的终端会话。
     * 这是管理终端生命周期的关键。
     *
     * @param event 断开连接事件。
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
     * 处理前端请求启动一个新的终端会话。
     *
     * @param headerAccessor 消息头访问器，用于获取会话ID。
     */
    @MessageMapping("/terminal/start")
    public void startTerminal(SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.startSession(sessionId);
        }
    }

    /**
     * 接收来自前端的终端输入。
     *
     * @param input          前端发送的输入数据。
     * @param headerAccessor 消息头访问器，用于获取会话ID。
     */
    @MessageMapping("/terminal/input")
    public void handleInput(@Payload String input, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            terminalService.receiveInput(sessionId, input);
        }
    }
}