package com.example.webideabackend.service;

import com.example.webideabackend.model.RunSession;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
@Slf4j
public class RunSessionService {

    private final WebSocketNotificationService notificationService;
    // 使用 AtomicReference 来管理当前唯一的运行会话
    private final AtomicReference<RunSession> currentSession = new AtomicReference<>();
    // 用于日志批处理的调度器
    private final ScheduledExecutorService logScheduler = Executors.newSingleThreadScheduledExecutor();

    @Autowired
    public RunSessionService(WebSocketNotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /**
     * 服务初始化时，启动一个定时任务，每隔200毫秒刷新一次日志缓冲区。
     */
    @PostConstruct
    public void init() {
        logScheduler.scheduleAtFixedRate(this::flushLogBuffer, 200, 200, TimeUnit.MILLISECONDS);
    }

    /**
     * 启动一个新的程序会话。如果已有会话在运行，会先停止它。
     * @param commandList      要执行的命令列表
     * @param workingDirectory 工作目录
     */
    public void start(List<String> commandList, File workingDirectory) {
        // 如果当前有会话在运行，先停止它
        stop();

        try {
            ProcessBuilder processBuilder = new ProcessBuilder(commandList)
                    .directory(workingDirectory)
                    .redirectErrorStream(true); // 合并标准输出和错误流

            Process process = processBuilder.start();
            log.info("Started new process with PID: {}. Command: {}", process.pid(), String.join(" ", commandList));

            // 创建并注册新的会话
            RunSession newSession = new RunSession(process, new StringBuilder(), new AtomicBoolean(true));
            this.currentSession.set(newSession);

            // 通知前端，程序已开始运行
            notificationService.sendMessage("/topic/run/status", "STARTED");

            // 在一个新线程中读取进程的输出
            startLogReader(newSession);

        } catch (IOException e) {
            log.error("Failed to start process with command: {}", commandList, e);
            notificationService.sendRunLog("[FATAL] Failed to start process: " + e.getMessage());
            notificationService.sendMessage("/topic/run/status", "FINISHED");
        }
    }

    /**
     * 停止当前正在运行的会话。
     */
    public void stop() {
        RunSession session = currentSession.getAndSet(null);
        if (session != null && session.process().isAlive()) {
            log.info("Stopping process with PID: {}", session.process().pid());
            session.isRunning().set(false); // 标记为停止
            session.process().destroyForcibly(); // 强制终止进程
            try {
                // 等待一小段时间确保进程已终止
                session.process().waitFor(500, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            log.info("Process stopped.");
            notificationService.sendRunLog("\n[INFO] Process terminated by user.");
            notificationService.sendMessage("/topic/run/status", "FINISHED");
        }
    }

    /**
     * 启动一个线程来持续读取进程的输出流，并将其放入缓冲区。
     * @param session 当前的运行会话
     */
    private void startLogReader(RunSession session) {
        CompletableFuture.runAsync(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(session.process().getInputStream()))) {
                String line;
                while (session.isRunning().get() && (line = reader.readLine()) != null) {
                    synchronized (session.logBuffer()) {
                        session.logBuffer().append(line).append("\n");
                    }
                }
            } catch (IOException e) {
                if (session.isRunning().get()) { // 只有在不是用户主动停止时才记录为错误
                    log.warn("Error reading from process stream: {}", e.getMessage());
                }
            } finally {
                // 确保无论如何进程结束都会清理会话
                int exitCode = session.process().exitValue();
                notificationService.sendRunLog("\n[INFO] Process finished with exit code: " + exitCode);
                log.info("Process with PID {} finished with exit code {}.", session.process().pid(), exitCode);
                currentSession.compareAndSet(session, null); // 只有当当前会话还是它自己时才清理
                notificationService.sendMessage("/topic/run/status", "FINISHED");
            }
        });
    }

    /**
     * 定时任务，将缓冲区中的日志发送到前端。
     */
    private void flushLogBuffer() {
        RunSession session = currentSession.get();
        if (session == null) return;

        String logsToSend;
        synchronized (session.logBuffer()) {
            if (session.logBuffer().length() == 0) {
                return; // 缓冲区没内容，直接返回
            }
            logsToSend = session.logBuffer().toString();
            session.logBuffer().setLength(0); // 清空缓冲区
        }

        if (!logsToSend.isEmpty()) {
            notificationService.sendRunLog(logsToSend);
        }
    }

    /**
     * 服务销毁时，确保所有资源被释放。
     */
    @PreDestroy
    public void shutdown() {
        log.info("Shutting down RunSessionService.");
        stop(); // 停止所有正在运行的进程
        logScheduler.shutdownNow(); // 关闭定时任务
    }
}