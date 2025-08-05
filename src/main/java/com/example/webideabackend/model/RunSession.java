package com.example.webideabackend.model;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 代表一个正在运行的用户程序会话。
 *
 * @param process   底层的操作系统进程。
 * @param logBuffer 用于批量发送日志的缓冲区。
 * @param isRunning 标记该会话是否仍在活动。
 */
public record RunSession(
        Process process,
        StringBuilder logBuffer,
        AtomicBoolean isRunning
) {
}