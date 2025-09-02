/**
 * TerminalService.java
 *
 * 该服务负责管理后端的伪终端 (pseudo-terminal) 会话。
 * 已修改，新增了对 `docker exec` 的支持。
 */
package club.ppmc.idea.service;

import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class TerminalService {

    private final WebSocketNotificationService notificationService;
    private final SettingsService settingsService;
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<String, TerminalSession> sessions = new ConcurrentHashMap<>();

    private static final boolean IS_WINDOWS = System.getProperty("os.name").toLowerCase().contains("win");

    public TerminalService(
            WebSocketNotificationService notificationService, SettingsService settingsService) {
        this.notificationService = notificationService;
        this.settingsService = settingsService;
    }

    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    public void startSession(String sessionId, String relativePath) {
        if (sessions.containsKey(sessionId)) {
            log.info("系统终端会话 {} 已存在。在启动新会话前将先结束旧会话。", sessionId);
            endSession(sessionId);
        }

        try {
            ProcessBuilder processBuilder;
            if (IS_WINDOWS) {
                processBuilder = new ProcessBuilder("cmd.exe", "/K", "chcp 65001 > nul");
            } else {
                processBuilder = new ProcessBuilder("bash", "-i");
                Map<String, String> env = processBuilder.environment();
                env.put("LANG", "en_US.UTF-8");
            }

            Path workspaceRoot = getWorkspaceRoot();
            Path workingDirectory;
            if (StringUtils.hasText(relativePath)) {
                workingDirectory = workspaceRoot.resolve(relativePath).normalize();
                if (!Files.isDirectory(workingDirectory)) {
                    log.warn("终端路径未找到: {}. 将默认使用工作区根目录。", workingDirectory);
                    notificationService.sendTerminalOutput(sessionId, "[错误] 目录未找到: " + relativePath + "\n");
                    workingDirectory = workspaceRoot;
                }
            } else {
                workingDirectory = workspaceRoot;
            }

            processBuilder.directory(workingDirectory.toFile()).redirectErrorStream(true);

            Process process = processBuilder.start();
            log.info("已在目录 {} 中为会话 {} 启动新系统终端进程", workingDirectory, sessionId);

            var writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            var session = new TerminalSession(process, writer, false); // isDocker = false
            sessions.put(sessionId, session);

            executorService.submit(() -> readAndForwardOutput(sessionId, process, false));

        } catch (IOException e) {
            log.error("为 {} 启动系统终端会话失败: {}", sessionId, e.getMessage());
            notificationService.sendTerminalOutput(sessionId, "错误: 启动终端失败。 " + e.getMessage());
        }
    }

    /**
     * ========================= START: 启动 Docker Exec 会话 =========================
     */
    public void startDockerExecSession(String sessionId, String containerId) {
        if (sessions.containsKey(sessionId)) {
            log.info("Docker 终端会话 {} 已存在。在启动新会话前将先结束旧会话。", sessionId);
            endSession(sessionId);
        }

        try {
            String[] shellsToTry = {"/bin/bash", "sh"};
            Process process = null;
            boolean success = false;

            for (String shell : shellsToTry) {
                ProcessBuilder processBuilder = new ProcessBuilder("docker", "exec", "-i", containerId, shell);
                processBuilder.redirectErrorStream(true);
                log.info("尝试为会话 {} 在容器 {} 中启动 Docker Exec: {}", sessionId, containerId, String.join(" ", processBuilder.command()));
                try {
                    process = processBuilder.start();
                    if (process.waitFor(200, java.util.concurrent.TimeUnit.MILLISECONDS) && process.exitValue() != 0) {
                        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                        String errorOutput = reader.lines().collect(Collectors.joining("\n"));
                        if (errorOutput.toLowerCase().contains("executable file not found")) {
                            log.warn("Shell '{}' 在容器 {} 中不存在，尝试下一个...", shell, containerId);
                            continue;
                        }
                    }
                    success = true;
                    break;
                } catch (IOException e) {
                    log.warn("启动 shell '{}' 失败，尝试下一个...", shell, e);
                }
            }

            if (!success || process == null) {
                throw new IOException("无法在容器中启动任何一个有效的 shell (bash, sh)。");
            }

            // ========================= 关键修复 START =========================
            // 创建一个新的 final 变量来捕获 process 的当前值，以便在 lambda 中使用。
            final Process finalProcess = process;
            log.info("已为会话 {} 在容器 {} 中成功启动 Docker Exec 进程", sessionId, containerId);

            var writer = new BufferedWriter(new OutputStreamWriter(finalProcess.getOutputStream(), StandardCharsets.UTF_8));
            var session = new TerminalSession(finalProcess, writer, true); // isDocker = true
            sessions.put(sessionId, session);

            executorService.submit(() -> readAndForwardOutput(sessionId, finalProcess, true));
            // ========================= 关键修复 END ===========================

        } catch (IOException | InterruptedException e) {
            log.error("为 {} 启动 Docker Exec 会话失败: {}", sessionId, e.getMessage());
            notificationService.sendDockerTerminalOutput(sessionId, "错误: 启动容器终端失败。 " + e.getMessage());
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        }
    }
    /**
     * ========================= END ================================================
     */

    private void readAndForwardOutput(String sessionId, Process process, boolean isDocker) {
        try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int charsRead;
            while ((charsRead = reader.read(buffer)) != -1) {
                String output = new String(buffer, 0, charsRead);
                if (isDocker) {
                    notificationService.sendDockerTerminalOutput(sessionId, output);
                } else {
                    notificationService.sendTerminalOutput(sessionId, output);
                }
            }
        } catch (IOException e) {
            log.info("读取终端进程输出时出错 (可能是会话已正常结束): {}", e.getMessage());
        } finally {
            log.info("会话 {} 的终端输出流已关闭。", sessionId);
            endSession(sessionId);
        }
    }

    public void receiveInput(String sessionId, String data) {
        TerminalSession session = sessions.get(sessionId);
        if (session == null) {
            log.warn("找不到ID为 {} 的活动终端会话。将忽略输入。", sessionId);
            return;
        }
        try {
            session.writer.write(data);
            session.writer.flush();
        } catch (IOException e) {
            log.error("向会话 {} 的终端进程写入失败: {}", sessionId, e.getMessage());
            endSession(sessionId);
        }
    }

    public void endSession(String sessionId) {
        TerminalSession session = sessions.remove(sessionId);
        if (session != null) {
            String type = session.isDocker ? "Docker Exec" : "系统";
            log.info("正在结束会话 {} 的 {} 终端。", sessionId, type);
            if (session.process.isAlive()) {
                session.process.destroyForcibly();
            }
            try {
                session.writer.close();
            } catch (IOException e) {
                log.warn("关闭会话 {} 的终端写入器时出错: {}", sessionId, e.getMessage());
            }
        }
    }

    @PreDestroy
    public void destroy() {
        log.info("正在关闭 TerminalService。将销毁所有活动的终端会话。");
        sessions.keySet().forEach(this::endSession);
        executorService.shutdownNow();
    }

    private record TerminalSession(Process process, BufferedWriter writer, boolean isDocker) {}
}