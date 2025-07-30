package com.example.webideabackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // 启用一个简单的内存消息代理，客户端可以订阅 '/topic' 前缀的通道
        config.enableSimpleBroker("/topic");
        // 应用程序目的地前缀，客户端发送消息到带有 '/app' 前缀的URL，将路由到 @MessageMapping 方法
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // 注册 WebSocket 端点，客户端将连接到这个URL
        // .withSockJS() 提供了 SockJS 回退选项，用于不支持 WebSocket 的浏览器
        registry.addEndpoint("/ws").withSockJS();
    }
}