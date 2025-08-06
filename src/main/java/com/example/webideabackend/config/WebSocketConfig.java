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
        // 通过 setHeartbeatValue 配置 STOMP 协议层面的心跳机制
        // 这用于应用级别的存活检测
        config.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{10000, 10000})
                .setTaskScheduler(this.taskScheduler);
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
                .withSockJS()
                // ========================= 关键修改 START =========================
                // 添加 SockJS 传输层心跳，以防止反向代理（如Nginx）因超时而关闭连接。
                // SockJS 会每隔 25 秒发送一个心跳帧，以保持连接活跃。
                // 这是一个标准的做法，可以解决生产环境中常见的“Session closed”问题。
                .setHeartbeatTime(25000);
        // ========================= 关键修改 END ===========================
    }
}