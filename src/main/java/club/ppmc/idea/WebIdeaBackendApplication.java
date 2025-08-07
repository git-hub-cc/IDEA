/**
 * WebIdeaBackendApplication.java
 *
 * Spring Boot 应用的主入口类。
 * 负责启动整个应用程序。
 * @EnableWebSocketMessageBroker 注解用于启用 WebSocket 和 STOMP 消息代理功能。
 */
package club.ppmc.idea;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;

@SpringBootApplication
@EnableWebSocketMessageBroker
public class WebIdeaBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebIdeaBackendApplication.class, args);
    }
}