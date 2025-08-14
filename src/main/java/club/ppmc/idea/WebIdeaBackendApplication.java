/**
 * WebIdeaBackendApplication.java
 *
 * Spring Boot 应用的主入口类。
 * 负责启动整个应用程序。
 * @EnableWebSocketMessageBroker 注解用于启用 WebSocket 和 STOMP 消息代理功能。
 * @EnableScheduling 注解用于启用Spring的定时任务功能，供 SystemMonitorService 使用。
 */
package club.ppmc.idea;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;

@SpringBootApplication
@EnableWebSocketMessageBroker
@EnableScheduling // <-- 新增注解，启用定时任务
public class WebIdeaBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebIdeaBackendApplication.class, args);
    }
}