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

    private final WebSocketNotificationService notificationService;
    private final Path workspaceRoot;
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<String, TerminalSession> sessions = new ConcurrentHashMap<>();

    private static final boolean IS_WINDOWS = System.getProperty("os.name").toLowerCase().contains("win");

    @Autowired
    public TerminalService(WebSocketNotificationService notificationService, @Value("${app.workspace-root}") String workspaceRootPath) {
        this.notificationService = notificationService;
        this.workspaceRoot = Path.of(workspaceRootPath);
    }

    public void startSession(String sessionId, String projectPath) {
        if (sessions.containsKey(sessionId)) {
            log.warn("Terminal session {} already exists.", sessionId);
            return;
        }

        try {
            ProcessBuilder processBuilder;
            if (IS_WINDOWS) {
                processBuilder = new ProcessBuilder("cmd.exe", "/K", "chcp 65001 > nul");
            } else {
                processBuilder = new ProcessBuilder("bash", "-i");
                Map<String, String> env = processBuilder.environment();
                env.put("LANG", "en_US.UTF-8");
                env.put("LC_ALL", "en_US.UTF-8");
            }

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

            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            TerminalSession session = new TerminalSession(process, writer);
            sessions.put(sessionId, session);

            executorService.submit(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    char[] buffer = new char[4096];
                    int charsRead;
                    while ((charsRead = reader.read(buffer)) != -1) {
                        notificationService.sendTerminalOutput(sessionId, new String(buffer, 0, charsRead));
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
            notificationService.sendTerminalOutput(sessionId, "Error: Failed to start terminal. " + e.getMessage());
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
            if (session.process.isAlive()) {
                session.process.destroy();
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