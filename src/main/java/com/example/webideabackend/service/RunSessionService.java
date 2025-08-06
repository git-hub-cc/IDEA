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
    private final AtomicReference<RunSession> currentSession = new AtomicReference<>();
    private final ScheduledExecutorService logScheduler = Executors.newSingleThreadScheduledExecutor();

    @Autowired
    public RunSessionService(WebSocketNotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostConstruct
    public void init() {
        logScheduler.scheduleAtFixedRate(this::flushLogBuffer, 200, 200, TimeUnit.MILLISECONDS);
    }

    public void start(List<String> commandList, File workingDirectory) {
        stop(); // 开始新任务前，确保旧任务已停止

        try {
            ProcessBuilder processBuilder = new ProcessBuilder(commandList)
                    .directory(workingDirectory)
                    .redirectErrorStream(true);

            Process process = processBuilder.start();
            log.info("Started new process with PID: {}. Command: {}", process.pid(), String.join(" ", commandList));

            RunSession newSession = new RunSession(process, new StringBuilder(), new AtomicBoolean(true));
            this.currentSession.set(newSession);

            // 发送 "STARTED" 状态，让前端UI更新
            notificationService.sendMessage("/topic/run/status", "STARTED");

            startLogReader(newSession);

        } catch (IOException e) {
            log.error("Failed to start process with command: {}", commandList, e);
            notificationService.sendRunLog("[FATAL] Failed to start process: " + e.getMessage());
            notificationService.sendMessage("/topic/run/status", "FINISHED");
        }
    }

    public void stop() {
        RunSession session = currentSession.getAndSet(null);
        if (session != null && session.process().isAlive()) {
            log.info("Stopping process with PID: {}", session.process().pid());
            session.isRunning().set(false); // 停止日志读取循环
            session.process().destroyForcibly();
            try {
                session.process().waitFor(500, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            log.info("Process stopped.");
            notificationService.sendRunLog("\n[INFO] Process terminated by user.");
            notificationService.sendMessage("/topic/run/status", "FINISHED");
        }
    }

    private void startLogReader(RunSession session) {
        CompletableFuture.runAsync(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(session.process().getInputStream()))) {
                String line;
                // 只有在会话处于运行状态时才读取日志
                while (session.isRunning().get() && (line = reader.readLine()) != null) {
                    synchronized (session.logBuffer()) {
                        session.logBuffer().append(line).append("\n");
                    }
                }
            } catch (IOException e) {
                // 如果会话仍然标记为运行中，这可能是一个真正的错误
                if (session.isRunning().get()) {
                    log.warn("Error reading from process stream: {}", e.getMessage());
                }
            } finally {
                // ========================= 关键优化：确保日志顺序和最终状态的正确性 =========================
                // 1. 获取进程退出码
                int exitCode = session.process().exitValue();

                // 2. 创建一个临时的 StringBuilder 来构造最终的、完整的日志消息
                StringBuilder finalOutput = new StringBuilder();

                // 3. 同步访问日志缓冲区，将剩余内容移动到临时 builder 中
                synchronized (session.logBuffer()) {
                    if (session.logBuffer().length() > 0) {
                        finalOutput.append(session.logBuffer());
                        session.logBuffer().setLength(0); // 清空原始缓冲区
                    }
                }

                // 4. 将进程结束信息追加到临时 builder 的末尾
                finalOutput.append("\n[INFO] Process finished with exit code: ").append(exitCode);

                // 5. 将合并后的完整消息一次性发送到前端
                notificationService.sendRunLog(finalOutput.toString());

                // 6. 在后端日志中记录进程结束
                log.info("Process with PID {} finished with exit code {}.", session.process().pid(), exitCode);

                // 7. 清理当前会话
                currentSession.compareAndSet(session, null);

                // 8. 最后，发送 FINISHED 状态通知，让UI可以更新（例如，使运行按钮变回可用）
                notificationService.sendMessage("/topic/run/status", "FINISHED");
                // ========================= 关键优化 END ============================================
            }
        });
    }

    private void flushLogBuffer() {
        RunSession session = currentSession.get();
        if (session == null) return;

        String logsToSend;
        synchronized (session.logBuffer()) {
            if (session.logBuffer().length() == 0) {
                return;
            }
            logsToSend = session.logBuffer().toString();
            session.logBuffer().setLength(0);
        }

        if (!logsToSend.isEmpty()) {
            notificationService.sendRunLog(logsToSend);
        }
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down RunSessionService.");
        stop();
        logScheduler.shutdownNow();
    }
}