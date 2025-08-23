/**
 * RunSessionService.java
 *
 * 该服务负责管理一个正在运行的用户程序会话的生命周期。
 * 它维护一个单例的运行会话，处理进程的启动、日志的实时转发和进程的终止。
 * 使用了现代Java的 CompletableFuture 和 Process.onExit() 来可靠地管理异步进程。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.RunSession;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class RunSessionService {

    private final WebSocketNotificationService notificationService;
    private final AtomicReference<RunSession> currentSession = new AtomicReference<>();
    private final ScheduledExecutorService logScheduler = Executors.newSingleThreadScheduledExecutor();

    public RunSessionService(WebSocketNotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostConstruct
    public void init() {
        // 每200毫秒批量发送一次日志，以减少WebSocket通信频率，提升性能
        logScheduler.scheduleAtFixedRate(this::flushLogBuffer, 200, 200, TimeUnit.MILLISECONDS);
    }

    /**
     * 启动一个新的程序会话。如果已有会话在运行，会先将其终止。
     *
     * @param commandList 要执行的命令列表。
     * @param workingDirectory 命令执行的工作目录。
     */
    public void start(List<String> commandList, File workingDirectory) {
        stop(); // 开始新任务前，确保旧任务已停止

        try {
            var processBuilder =
                    new ProcessBuilder(commandList).directory(workingDirectory).redirectErrorStream(true);

            Process process = processBuilder.start();
            log.info("已启动新进程，PID: {}. 命令: {}", process.pid(), String.join(" ", commandList));

            var newSession = new RunSession(process, new StringBuilder(), new AtomicBoolean(true));
            if (!this.currentSession.compareAndSet(null, newSession)) {
                log.warn("设置新会话失败，可能有另一个会话同时启动。将终止新进程。");
                process.destroyForcibly();
                return;
            }

            notificationService.sendMessage("/topic/run/status", "STARTED");

            // ========================= 关键修改 START =========================
            // 设计改进: 使用 CompletableFuture 协调进程退出和日志读取完成，解决竞态条件。
            // 1. 启动日志读取器，它现在返回一个 Future，该 Future 在流被完全读取后完成。
            CompletableFuture<Void> logReaderFuture = startLogReader(newSession);

            // 2. 获取一个在进程退出时完成的 Future。
            CompletableFuture<Process> processExitFuture = process.onExit();

            // 3. 组合这两个 Future。当进程退出 并且 日志读取器完成时，才执行最终的清理工作。
            //    这确保了即使进程执行得非常快，它的所有输出也一定会被捕获。
            processExitFuture
                    .thenCombine(logReaderFuture, (p, v) -> p) // 等待两者都完成
                    .thenAccept(p -> {
                        log.info("进程 PID {} 已退出，且其输出流已完全读取。", p.pid());
                        handleSessionTermination(newSession, p.exitValue());
                    });
            // ========================= 关键修改 END ===========================

        } catch (IOException e) {
            log.error("启动进程失败，命令: {}", commandList, e);
            notificationService.sendRunLog("[致命错误] 启动进程失败: " + e.getMessage());
            notificationService.sendMessage("/topic/run/status", "FINISHED");
        }
    }

    /**
     * 停止当前正在运行的程序会话。
     */
    public void stop() {
        RunSession session = currentSession.get();
        if (session != null && session.process().isAlive()) {
            log.info("正在停止进程，PID: {}", session.process().pid());
            session.isRunning().set(false); // 指示日志读取线程停止
            session.process().destroyForcibly(); // 强制终止进程，这将自动触发 onExit() -> thenCombine() 回调链
            // 无需在此处发送 FINISHED 消息，回调链会统一处理
        }
    }

    /**
     * 在一个独立的线程中异步读取并转发指定会话的日志输出。
     *
     * @param session 正在运行的会话。
     * @return 一个在日志流完全读取后完成的 CompletableFuture。
     */
    // ========================= 关键修改 START =========================
    private CompletableFuture<Void> startLogReader(RunSession session) {
        return CompletableFuture.runAsync(
                () -> {
                    try (var reader =
                                 new BufferedReader(new InputStreamReader(session.process().getInputStream()))) {
                        String line;
                        // 循环条件变更：不再依赖 isRunning 标志，而是读取直到流结束 (readLine返回null)。
                        // 这确保了即使进程已终止，流中的所有缓冲数据也会被完全读取。
                        while ((line = reader.readLine()) != null) {
                            synchronized (session.logBuffer()) {
                                session.logBuffer().append(line).append("\n");
                            }
                        }
                    } catch (IOException e) {
                        // 如果进程被强行杀死，这里会抛出IO异常，是正常现象
                        if (session.isRunning().get()) {
                            log.warn("从进程流读取时出错 (如果进程被杀死，此为正常现象): {}", e.getMessage());
                        }
                    } finally {
                        log.debug("进程 PID {} 的日志读取线程已完成对输出流的读取。", session.process().pid());
                        // 所有清理工作都已移至 handleSessionTermination，此处无需操作
                    }
                });
    }
    // ========================= 关键修改 END ===========================

    /**
     * 统一处理会话的终止，包括日志刷新和状态通知。
     * 这个方法由 onExit() 和日志读取 Future 共同触发，保证在所有异步操作完成后执行。
     *
     * @param session 已结束的会话。
     * @param exitCode 进程的退出码。
     */
    private void handleSessionTermination(RunSession session, int exitCode) {
        // 防止旧的 onExit 回调干扰新的会话
        if (currentSession.get() != session) {
            log.warn("收到一个已过期的会话终止事件，PID {}。将忽略。", session.process().pid());
            return;
        }
        session.isRunning().set(false);

        // ========================= 关键修改 START =========================
        // 移除不可靠的 Thread.sleep()。
        // 由于我们现在等待日志读取线程完成，可以确信所有日志都已在缓冲区中。
        // ========================= 关键修改 END ===========================

        // 刷新所有剩余的日志
        flushLogBuffer(session);

        String finalMessage = String.format("\n[信息] 进程已结束，退出码: %d", exitCode);
        notificationService.sendRunLog(finalMessage);
        notificationService.sendMessage("/topic/run/status", "FINISHED");
        currentSession.compareAndSet(session, null); // 清理会话引用
    }

    private void flushLogBuffer() {
        RunSession session = currentSession.get();
        if (session != null) {
            flushLogBuffer(session);
        }
    }

    private void flushLogBuffer(RunSession session) {
        String logsToSend;
        synchronized (session.logBuffer()) {
            if (session.logBuffer().isEmpty()) {
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
        log.info("正在关闭 RunSessionService...");
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