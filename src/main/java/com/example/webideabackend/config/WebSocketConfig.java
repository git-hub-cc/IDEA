// src/main/java/com/example/webideabackend/config/WebSocketConfig.java

package com.example.webideabackend.config;

import com.sun.security.auth.UserPrincipal;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
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

    private final ThreadPoolTaskScheduler taskScheduler;

    public WebSocketConfig() {
        this.taskScheduler = new ThreadPoolTaskScheduler();
        this.taskScheduler.setPoolSize(1);
        this.taskScheduler.setThreadNamePrefix("ws-heartbeat-thread-");
        this.taskScheduler.initialize();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // ========================= 关键修改 START =========================
        // 通过 setHeartbeatValue 配置心跳机制，以保持连接活跃
        // 数组的第一个值(10000ms): 服务器向客户端发送心跳的频率
        // 数组的第二个值(10000ms): 服务器期望从客户端接收心跳的频率
        config.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{10000, 10000})
                .setTaskScheduler(this.taskScheduler);
        // ========================= 关键修改 END ===========================
        config.setApplicationDestinationPrefixes("/app");
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .setHandshakeHandler(new DefaultHandshakeHandler() {
                    @Override
                    protected Principal determineUser(ServerHttpRequest request, WebSocketHandler wsHandler, Map<String, Object> attributes) {
                        return new UserPrincipal(UUID.randomUUID().toString());
                    }
                })
                .withSockJS();
    }
}