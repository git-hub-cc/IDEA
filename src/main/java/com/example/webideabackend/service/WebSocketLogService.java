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
     * Sends a log message to a specific WebSocket destination.
     *
     * @param destination The WebSocket topic destination (e.g., "/topic/build-log").
     * @param message The log message to send.
     */
    public void sendMessage(String destination, String message) {
        messagingTemplate.convertAndSend(destination, message);
    }
}