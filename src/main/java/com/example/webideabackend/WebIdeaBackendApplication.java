package com.example.webideabackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;

@SpringBootApplication
@EnableWebSocketMessageBroker // 启用 WebSocket 消息代理
public class WebIdeaBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebIdeaBackendApplication.class, args);
    }

}