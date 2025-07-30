/**
 * TerminalService.java
 *
 * 该服务使用 java.lang.ProcessBuilder 管理后端的交互式shell进程。
 * 它为每个WebSocket会话创建一个独立的shell实例，并处理输入/输出的重定向。
 * 注意：此实现不创建真正的PTY，因此功能受限。
 */
package com.example.webideabackend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
@Slf4j
public class TerminalService implements DisposableBean {

    private final WebSocketLogService webSocketLogService;
    private final Path workspaceRoot;
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<String, TerminalSession> sessions = new ConcurrentHashMap<>();

    private static final String OUTPUT_TOPIC_PREFIX = "/topic/terminal-output/";
    private static final boolean IS_WINDOWS = System.getProperty("os.name").toLowerCase().contains("win");

    @Autowired
    public TerminalService(WebSocketLogService webSocketLogService, @Value("${app.workspace-root}") String workspaceRootPath) {
        this.webSocketLogService = webSocketLogService;
        this.workspaceRoot = Path.of(workspaceRootPath);
    }

    /**
     * 为给定的WebSocket会话ID启动一个新的shell进程。
     * @param sessionId WebSocket会话ID。
     */
    public void startSession(String sessionId) {
        if (sessions.containsKey(sessionId)) {
            log.warn("Terminal session {} already exists.", sessionId);
            return;
        }

        try {
            ProcessBuilder processBuilder;
            if (IS_WINDOWS) {
                processBuilder = new ProcessBuilder("cmd.exe");
            } else {
                // 使用 -i 标志尝试启动一个交互式shell
                processBuilder = new ProcessBuilder("bash", "-i");
            }
            processBuilder.directory(workspaceRoot.toFile());
            processBuilder.redirectErrorStream(true); // 合并 stdout 和 stderr

            Process process = processBuilder.start();
            log.info("Started new terminal process for session {}", sessionId);

            // 异步读取进程的输出并发送到WebSocket
            executorService.submit(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        // 将输出发送到特定于会话的主题
                        webSocketLogService.sendMessage(OUTPUT_TOPIC_PREFIX + sessionId, line + "\r\n");
                    }
                } catch (IOException e) {
                    log.error("Error reading from terminal process for session {}: {}", sessionId, e.getMessage());
                } finally {
                    log.info("Terminal output stream for session {} has closed.", sessionId);
                    endSession(sessionId); // 如果流关闭，则结束会话
                }
            });

            TerminalSession session = new TerminalSession(process, new BufferedWriter(new OutputStreamWriter(process.getOutputStream())));
            sessions.put(sessionId, session);

        } catch (IOException e) {
            log.error("Failed to start terminal session for {}: {}", sessionId, e.getMessage());
            webSocketLogService.sendMessage(OUTPUT_TOPIC_PREFIX + sessionId, "Error: Failed to start terminal. " + e.getMessage());
        }
    }

    /**
     * 接收来自前端的输入并写入到对应的shell进程。
     * @param sessionId WebSocket会话ID。
     * @param data 要写入的输入数据。
     */
    public void receiveInput(String sessionId, String data) {
        TerminalSession session = sessions.get(sessionId);
        if (session == null) {
            log.warn("No active terminal session for ID: {}. Ignoring input.", sessionId);
            return;
        }

        try {
            session.writer.write(data);
            session.writer.flush();
        } catch (IOException e) {
            log.error("Failed to write to terminal process for session {}: {}", sessionId, e.getMessage());
            endSession(sessionId);
        }
    }

    /**
     * 结束并清理一个shell会话。
     * @param sessionId WebSocket会话ID。
     */
    public void endSession(String sessionId) {
        TerminalSession session = sessions.remove(sessionId);
        if (session != null) {
            log.info("Ending terminal session for {}", sessionId);
            Process process = session.process;
            if (process.isAlive()) {
                process.destroy();
            }
            try {
                session.writer.close();
            } catch (IOException e) {
                log.warn("Error closing terminal writer for session {}: {}", sessionId, e.getMessage());
            }
        }
    }

    @Override
    public void destroy() {
        log.info("Shutting down TerminalService. Destroying all active terminal sessions.");
        // 复制一份keys以避免在迭代时修改map
        for (String sessionId : sessions.keySet()) {
            endSession(sessionId);
        }
        executorService.shutdownNow();
    }

    // 内部记录类，用于封装会话资源
    private record TerminalSession(Process process, BufferedWriter writer) {}
}