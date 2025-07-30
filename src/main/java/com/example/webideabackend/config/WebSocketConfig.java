/**
 * WebSocketConfig.java
 * 该文件负责配置WebSocket和STOMP消息代理。
 * 它启用了消息代理功能，定义了消息路由规则，并注册了客户端可以连接的WebSocket端点。
 * 新增了HandshakeHandler来为匿名用户分配唯一的身份标识。
 */
package com.example.webideabackend.config;

import com.sun.security.auth.UserPrincipal;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // topic: 用于广播消息 (一对多)
        // queue: 用于点对点消息 (一对一)
        config.enableSimpleBroker("/topic", "/queue");
        config.setApplicationDestinationPrefixes("/app");
        // 允许客户端发送到 /user/{userId}/...，Spring会路由到特定用户的队列
        config.setUserDestinationPrefix("/user");
    }

    /**
     * 注册STOMP协议的端点。
     * 这是客户端用于建立WebSocket连接的HTTP URL。
     *
     * @param registry STOMP端点注册表
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                // 添加一个握手处理器，为每个WebSocket会话分配一个唯一的、匿名的Principal
                .setHandshakeHandler(new DefaultHandshakeHandler() {
                    @Override
                    protected Principal determineUser(ServerHttpRequest request, WebSocketHandler wsHandler, Map<String, Object> attributes) {
                        // 这使得每个连接都有一个唯一的身份，对于 /user 目标地址至关重要
                        return new UserPrincipal(UUID.randomUUID().toString());
                    }
                })
                .withSockJS();
    }
}