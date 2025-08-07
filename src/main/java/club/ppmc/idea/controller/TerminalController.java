/**
 * TerminalController.java
 *
 * 这是一个WebSocket控制器，专门处理与后端伪终端的交互。
 * 它不处理HTTP请求，而是监听来自客户端的STOMP消息，并响应WebSocket事件。
 * 它与 TerminalService 协作来启动、管理和终止终端会话。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.service.TerminalService;
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

    /**
     * 监听WebSocket断开连接事件，以清理相应的终端会话。
     * 这是一个关键的资源管理步骤，确保在用户关闭浏览器或网络中断时，后端的终端进程能被正确终止。
     *
     * @param event 断开连接事件对象。
     */
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId != null) {
            log.info("WebSocket 连接断开: {}. 正在清理终端会话。", sessionId);
            terminalService.endSession(sessionId);
        }
    }

    /**
     * 处理从前端发起的启动新终端会话的请求。
     *
     * @param relativePath 用户希望终端启动时所在的路径（相对于工作区根目录）。可以为null或空。
     * @param headerAccessor 消息头访问器，用于获取唯一的会话ID。
     */
    @MessageMapping("/terminal/start")
    public void startTerminal(
            @Payload(required = false) @Nullable String relativePath,
            SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        if (sessionId != null) {
            log.info("收到会话 {} 在路径 '{}' 下的终端启动请求", sessionId, relativePath);
            terminalService.startSession(sessionId, relativePath);
        }
    }

    /**
     * 处理从前端终端发送的输入数据（例如，用户键入的命令）。
     *
     * @param input 用户输入的字符串。
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