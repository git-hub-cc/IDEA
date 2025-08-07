/**
 * WebSocketNotificationService.java
 *
 * 一个统一的WebSocket消息发送服务。
 * 该服务为应用提供一个单一、清晰的WebSocket通信出口，封装了 SimpMessagingTemplate 的使用细节。
 * 它负责将各类事件和日志（调试、构建、运行等）序列化后发送到前端对应的WebSocket主题(topic)上。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.debug.WsDebugEvent;
import com.google.gson.Gson;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class WebSocketNotificationService {

    private final SimpMessagingTemplate messagingTemplate;
    private final Gson gson;

    public WebSocketNotificationService(SimpMessagingTemplate messagingTemplate, Gson gson) {
        this.messagingTemplate = messagingTemplate;
        this.gson = gson;
    }

    /**
     * 发送调试事件到前端。
     * @param event 要发送的调试事件对象。
     */
    public void sendDebugEvent(WsDebugEvent<?> event) {
        // 使用Gson手动序列化，可以更好地控制JSON输出，特别是对于泛型记录类型
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
     * @param output 终端输出内容。
     */
    public void sendTerminalOutput(String sessionId, String output) {
        // 为每个终端会话创建一个唯一的topic
        String destination = String.format("/topic/terminal-output/%s", sessionId);
        sendMessage(destination, output);
    }

    /**
     * 向指定的WebSocket主题发送一个通用载荷(payload)。
     * 这是一个底层的、类型安全的方法。
     *
     * @param destination 目标WebSocket主题 (例如, "/topic/some-status")
     * @param payload 要发送的任何对象 (将被框架自动序列化为JSON)
     */
    public void sendMessage(String destination, Object payload) {
        messagingTemplate.convertAndSend(destination, payload);
    }
}