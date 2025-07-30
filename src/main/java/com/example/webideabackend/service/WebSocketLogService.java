/**
 * WebSocketLogService.java
 *
 * 这是一个服务类，它封装了向WebSocket客户端发送消息的逻辑。
 * 它作为 SimpMessagingTemplate 的一个简单外观(Facade)，提供了一个清晰的、
 * 具有业务含义的接口（sendMessage），供应用中其他服务调用。
 */
package com.example.webideabackend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class WebSocketLogService {

    private final SimpMessagingTemplate messagingTemplate;

    @Autowired
    public WebSocketLogService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * 向指定的WebSocket主题（destination）发送一个载荷(payload)。
     * Spring的SimpMessagingTemplate会自动将该对象序列化为JSON。
     *
     * @param destination 目标WebSocket主题 (例如, "/topic/build-log")
     * @param payload     要发送的任何可序列化对象 (例如, String, 或自定义的DTO)
     */
    public void sendMessage(String destination, Object payload) {
        // 使用模板将载荷发送到指定的目的地，所有订阅该目的地的客户端都会收到此消息。
        messagingTemplate.convertAndSend(destination, payload);
    }
}