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

    /**
     * 启动一个新的程序会话。
     * @param commandList      要执行的命令列表。
     * @param workingDirectory 命令执行的工作目录。
     */
    public void start(List<String> commandList, File workingDirectory) {
        stop(); // 开始新任务前，确保旧任务已停止

        try {
            ProcessBuilder processBuilder = new ProcessBuilder(commandList)
                    .directory(workingDirectory)
                    .redirectErrorStream(true);

            Process process = processBuilder.start();
            log.info("Started new process with PID: {}. Command: {}", process.pid(), String.join(" ", commandList));

            RunSession newSession = new RunSession(process, new StringBuilder(), new AtomicBoolean(true));
            if (!this.currentSession.compareAndSet(null, newSession)) {
                log.warn("Failed to set new session, another session might have started concurrently. Stopping new process.");
                process.destroyForcibly();
                return;
            }

            notificationService.sendMessage("/topic/run/status", "STARTED");

            // 启动一个异步任务来读取进程的输出
            startLogReader(newSession);

            // ========================= 关键修改 START: 使用 onExit() 监听进程结束 =========================
            // 这是检测进程结束的可靠方法
            process.onExit().thenAccept(p -> {
                log.info("Process with PID {} has exited with code {}.", p.pid(), p.exitValue());
                handleSessionTermination(newSession, p.exitValue());
            });
            // ========================= 关键修改 END ================================================

        } catch (IOException e) {
            log.error("Failed to start process with command: {}", commandList, e);
            notificationService.sendRunLog("[FATAL] Failed to start process: " + e.getMessage());
            notificationService.sendMessage("/topic/run/status", "FINISHED");
        }
    }

    /**
     * 停止当前正在运行的程序会话。
     */
    public void stop() {
        RunSession session = currentSession.get();
        if (session != null && session.process().isAlive()) {
            log.info("Stopping process with PID: {}", session.process().pid());
            session.isRunning().set(false); // 停止日志读取循环
            session.process().destroyForcibly(); // 强制终止进程，这将触发 onExit()
            // 无需在此处发送 FINISHED，onExit() 回调会处理
        }
    }

    /**
     * 异步读取并转发指定会话的日志输出。
     * @param session 正在运行的会话。
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
                if (session.isRunning().get()) {
                    log.warn("Error reading from process stream (this is expected if process is killed): {}", e.getMessage());
                }
            } finally {
                log.debug("Log reader thread for PID {} is terminating.", session.process().pid());
                // 日志读取器结束不代表进程结束，所有清理工作移至 handleSessionTermination
            }
        });
    }

    // ========================= 关键修改 START: 新增一个集中的会话终止处理方法 =========================
    /**
     * 处理会话的终止，包括日志刷新和状态通知。
     * 这个方法由 onExit() 回调触发，保证在进程结束后执行。
     *
     * @param session   已结束的会话。
     * @param exitCode  进程的退出码。
     */
    private void handleSessionTermination(RunSession session, int exitCode) {
        // 确保这个会话是当前活动的会话，防止旧的 onExit 回调干扰新的会话
        if (currentSession.get() != session) {
            log.warn("An old session termination event was received for PID {}. Ignoring.", session.process().pid());
            return;
        }

        // 1. 确保日志读取循环已停止
        session.isRunning().set(false);

        // 2. 延迟一小段时间（例如100ms），让日志读取线程有机会处理完最后的输出
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        // 3. 刷新所有剩余的日志
        flushLogBuffer(session);

        // 4. 发送最终的日志消息和退出码
        String finalMessage = String.format("\n[INFO] Process finished with exit code: %d", exitCode);
        notificationService.sendRunLog(finalMessage);

        // 5. 通知前端UI进程已结束
        notificationService.sendMessage("/topic/run/status", "FINISHED");

        // 6. 清理当前会话引用
        currentSession.compareAndSet(session, null);
    }
    // ========================= 关键修改 END =======================================================


    /**
     * 定期刷新日志缓冲区，将内容发送到前端。
     */
    private void flushLogBuffer() {
        RunSession session = currentSession.get();
        if (session == null) return;
        flushLogBuffer(session);
    }

    /**
     * 刷新指定会话的日志缓冲区。
     * @param session 要刷新日志的会话。
     */
    private void flushLogBuffer(RunSession session) {
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
        logScheduler.shutdown();
        try {
            if (!logScheduler.awaitTermination(1, TimeUnit.SECONDS)) {
                logScheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            logScheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}