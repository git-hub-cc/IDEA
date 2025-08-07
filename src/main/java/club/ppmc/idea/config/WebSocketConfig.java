/**
 * WebSocketConfig.java
 *
 * 配置Spring WebSocket和STOMP消息代理。
 * 该类负责定义WebSocket端点，配置消息代理（broker），并设置心跳机制以保持连接稳定。
 * 与 UserSessionService 和 WebSocketSessionListener 关联，共同管理用户会话。
 */
package club.ppmc.idea.config;

import com.sun.security.auth.UserPrincipal;
import java.security.Principal;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /**
     * 配置消息代理（Message Broker）。
     * 消息代理负责将消息从一个客户端路由到其他客户端。
     *
     * <p><b>设计思路</b>:
     * 1. <b>Simple Broker</b>: 使用 `/topic` 和 `/queue` 作为公共和私有消息的前缀。
     *    - `/topic`: 用于广播消息（一对多）。
     *    - `/queue`: STOMP标准中用于点对点消息的前缀，Spring会将其转换为 `/user/{username}/queue`。
     * 2. <b>Heartbeat</b>: 设置STOMP协议层面的心跳（10秒发送，10秒接收）。这用于应用级别的存活检测，
     *    如果服务器或客户端在规定时间内没有收到对方的心跳，就会认为连接已断开。
     * 3. <b>Application Destination</b>: `/app` 是客户端发送消息到服务器控制器（@MessageMapping）的前缀。
     * 4. <b>User Destination</b>: `/user` 是用于发送点对点消息的前缀，与 `SimpMessagingTemplate.convertAndSendToUser` 配合使用。
     * </p>
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        var taskScheduler = new ThreadPoolTaskScheduler();
        taskScheduler.setPoolSize(1);
        taskScheduler.setThreadNamePrefix("ws-heartbeat-thread-");
        taskScheduler.initialize();

        config.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[] {10000, 10000}) // 10秒心跳
                .setTaskScheduler(taskScheduler);
        config.setApplicationDestinationPrefixes("/app");
        config.setUserDestinationPrefix("/user");
    }

    /**
     * 注册STOMP端点，这是客户端需要连接的WebSocket入口。
     *
     * <p><b>设计思路</b>:
     * 1. <b>Endpoint</b>: `/ws` 是客户端发起WebSocket连接的HTTP URL。
     * 2. <b>Handshake Handler</b>: 自定义握手处理器，为每个匿名连接分配一个唯一的UUID作为其 `Principal`。
     *    这对于后续在 `UserSessionService` 中跟踪和管理单个匿名用户至关重要。
     * 3. <b>SockJS Fallback</b>: 启用 `withSockJS()` 是为了提供向后兼容性，允许在不支持WebSocket的浏览器或网络环境中使用
     *    长轮询等技术模拟WebSocket连接。
     * 4. <b>SockJS Heartbeat</b>: 设置 `setHeartbeatTime(25000)` 是为了解决传输层面的超时问题。
     *    一些反向代理（如Nginx）或防火墙可能会因为连接长时间无数据传输而关闭它。SockJS会每隔25秒发送一个心跳帧，
     *    以保持TCP连接活跃，防止被意外断开。
     * </p>
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry
                .addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .setHandshakeHandler(
                        new DefaultHandshakeHandler() {
                            @Override
                            protected Principal determineUser(
                                    ServerHttpRequest request,
                                    WebSocketHandler wsHandler,
                                    Map<String, Object> attributes) {
                                // 为每个连接分配一个唯一的Principal，用于会话管理
                                return new UserPrincipal(UUID.randomUUID().toString());
                            }
                        })
                .withSockJS()
                .setHeartbeatTime(25000); // 传输层心跳，防止代理超时
    }
}