package com.example.webideabackend.service;

import com.example.webideabackend.model.debug.WsDebugEvent;
import com.google.gson.Gson;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/**
 * 统一的WebSocket消息发送服务。
 * 该服务整合了之前 WebSocketService 和 WebSocketLogService 的功能，
 * 为应用提供一个单一、清晰的WebSocket通信出口。
 */
@Service
public class WebSocketNotificationService {

    private final SimpMessagingTemplate messagingTemplate;
    private final Gson gson; // 使用Gson进行序列化，以确保与前端的兼容性

    @Autowired
    public WebSocketNotificationService(SimpMessagingTemplate messagingTemplate, Gson gson) {
        this.messagingTemplate = messagingTemplate;
        this.gson = gson;
    }

    /**
     * 发送调试事件到前端。
     * @param event 要发送的调试事件对象。
     */
    public void sendDebugEvent(WsDebugEvent<?> event) {
        // 使用Gson手动序列化，可以更好地控制JSON输出，特别是对于泛型记录类型。
        String payload = gson.toJson(event);
        sendMessage("/topic/debug-events", payload);
    }

    /**
     * 发送构建日志到前端。
     * @param message 日志消息。
     */
    public void sendBuildLog(String message) {
        sendMessage("/topic/build-log", message);
    }

    /**
     * 发送运行日志到前端。
     * @param message 日志消息。
     */
    public void sendRunLog(String message) {
        sendMessage("/topic/run-log", message);
    }

    /**
     * 发送终端输出到特定会话的前端。
     * @param sessionId 用户的 WebSocket 会话ID。
     * @param output    终端输出内容。
     */
    public void sendTerminalOutput(String sessionId, String output) {
        String destination = String.format("/topic/terminal-output/%s", sessionId);
        sendMessage(destination, output);
    }

    /**
     * 向指定的WebSocket主题发送一个载荷(payload)。
     * 这是一个通用的底层方法。
     * @param destination 目标WebSocket主题 (例如, "/topic/build-log")
     * @param payload     要发送的任何对象 (将被自动序列化)
     */
    public void sendMessage(String destination, Object payload) {
        messagingTemplate.convertAndSend(destination, payload);
    }
}