package com.example.webideabackend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
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

    public void startSession(String sessionId, String projectPath) {
        if (sessions.containsKey(sessionId)) {
            log.warn("Terminal session {} already exists.", sessionId);
            return;
        }

        try {
            ProcessBuilder processBuilder;
            // ========================= 关键修改 START：解决乱码问题 =========================
            if (IS_WINDOWS) {
                // 在Windows上，使用 cmd.exe
                processBuilder = new ProcessBuilder("cmd.exe");
            } else {
                // 在Linux/macOS上，使用交互式bash会话
                processBuilder = new ProcessBuilder("bash", "-i");
                // 为非Windows系统设置UTF-8环境变量，这是解决乱码的最佳实践
                Map<String, String> env = processBuilder.environment();
                env.put("LANG", "en_US.UTF-8");
                env.put("LC_ALL", "en_US.UTF-8");
            }
            // ========================= 关键修改 END ===========================

            Path workingDirectory;
            if (StringUtils.hasText(projectPath)) {
                workingDirectory = workspaceRoot.resolve(projectPath).normalize();
                if (!Files.exists(workingDirectory) || !Files.isDirectory(workingDirectory)) {
                    log.warn("Project path for terminal not found: {}. Defaulting to workspace root.", workingDirectory);
                    workingDirectory = workspaceRoot;
                }
            } else {
                workingDirectory = workspaceRoot;
            }
            processBuilder.directory(workingDirectory.toFile());
            processBuilder.redirectErrorStream(true);

            Process process = processBuilder.start();
            log.info("Started new terminal process for session {} in directory {}", sessionId, workingDirectory);

            // ========================= 关键修改 START：解决乱码问题 =========================
            // 明确使用UTF-8编码来读写进程流
            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            TerminalSession session = new TerminalSession(process, writer);
            sessions.put(sessionId, session);

            // 如果是Windows，在会话开始时自动发送 "chcp 65001" 命令将代码页切换到UTF-8
            if (IS_WINDOWS) {
                writer.write("chcp 65001\n");
                writer.flush();
                log.info("Sent 'chcp 65001' to Windows terminal for UTF-8 support.");
            }
            // ========================= 关键修改 END ===========================

            executorService.submit(() -> {
                // 明确使用UTF-8编码读取进程输出
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    char[] buffer = new char[4096];
                    int charsRead;
                    while ((charsRead = reader.read(buffer)) != -1) {
                        webSocketLogService.sendMessage(OUTPUT_TOPIC_PREFIX + sessionId, new String(buffer, 0, charsRead));
                    }
                } catch (IOException e) {
                    log.error("Error reading from terminal process for session {}: {}", sessionId, e.getMessage());
                } finally {
                    log.info("Terminal output stream for session {} has closed.", sessionId);
                    endSession(sessionId);
                }
            });

        } catch (IOException e) {
            log.error("Failed to start terminal session for {}: {}", sessionId, e.getMessage());
            webSocketLogService.sendMessage(OUTPUT_TOPIC_PREFIX + sessionId, "Error: Failed to start terminal. " + e.getMessage());
        }
    }

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
        sessions.keySet().forEach(this::endSession);
        executorService.shutdownNow();
    }

    private record TerminalSession(Process process, BufferedWriter writer) {}
}