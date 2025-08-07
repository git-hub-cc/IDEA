/**
 * TerminalService.java
 *
 * 该服务负责管理后端的伪终端 (pseudo-terminal) 会话。
 * 它为每个WebSocket连接创建一个独立的系统进程（如 cmd.exe 或 bash），
 * 并通过WebSocket将输入输出流与前端的 xterm.js 组件连接起来。
 * 它依赖 SettingsService 来确定终端启动时的工作目录。
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
            log.info("终端会话 {} 已存在。在启动新会话前将先结束旧会话。", sessionId);
            endSession(sessionId);
        }

        try {
            ProcessBuilder processBuilder;
            if (IS_WINDOWS) {
                // 在Windows上，启动cmd并执行chcp 65001将代码页切换为UTF-8，以支持中文
                processBuilder = new ProcessBuilder("cmd.exe", "/K", "chcp 65001 > nul");
            } else {
                // 在Linux/macOS上，启动一个交互式的bash会话
                processBuilder = new ProcessBuilder("bash", "-i");
                Map<String, String> env = processBuilder.environment();
                env.put("LANG", "en_US.UTF-8"); // 设置环境变量以支持UTF-8
            }

            // 确定工作目录
            Path workspaceRoot = getWorkspaceRoot();
            Path workingDirectory;
            if (StringUtils.hasText(relativePath)) {
                workingDirectory = workspaceRoot.resolve(relativePath).normalize();
                if (!Files.isDirectory(workingDirectory)) {
                    log.warn("终端路径未找到或不是目录: {}. 将默认使用工作区根目录。", workingDirectory);
                    notificationService.sendTerminalOutput(sessionId, "[错误] 目录未找到: " + relativePath + "\n");
                    workingDirectory = workspaceRoot;
                }
            } else {
                workingDirectory = workspaceRoot;
            }

            processBuilder.directory(workingDirectory.toFile()).redirectErrorStream(true);

            Process process = processBuilder.start();
            log.info("已在目录 {} 中为会话 {} 启动新终端进程", workingDirectory, sessionId);

            var writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            var session = new TerminalSession(process, writer);
            sessions.put(sessionId, session);

            // 异步读取进程输出并发送到前端
            executorService.submit(() -> readAndForwardOutput(sessionId, process));

        } catch (IOException e) {
            log.error("为 {} 启动终端会话失败: {}", sessionId, e.getMessage());
            notificationService.sendTerminalOutput(sessionId, "错误: 启动终端失败。 " + e.getMessage());
        }
    }

    private void readAndForwardOutput(String sessionId, Process process) {
        try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int charsRead;
            while ((charsRead = reader.read(buffer)) != -1) {
                notificationService.sendTerminalOutput(sessionId, new String(buffer, 0, charsRead));
            }
        } catch (IOException e) {
            // 当进程被销毁时，读取流会关闭并抛出异常，这是正常行为
            log.info("读取终端进程输出时出错 (可能是会话已正常结束): {}", e.getMessage());
        } finally {
            log.info("会话 {} 的终端输出流已关闭。", sessionId);
            endSession(sessionId); // 确保在流结束后清理会话
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
            endSession(sessionId); // 写入失败意味着连接已断开，清理会话
        }
    }

    public void endSession(String sessionId) {
        TerminalSession session = sessions.remove(sessionId);
        if (session != null) {
            log.info("正在结束会话 {} 的终端。", sessionId);
            if (session.process.isAlive()) {
                session.process.destroy();
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

    private record TerminalSession(Process process, BufferedWriter writer) {}
}