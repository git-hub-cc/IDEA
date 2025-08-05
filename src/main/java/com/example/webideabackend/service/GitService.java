// 文件: src/main/java/com/example/webideabackend/service/GitService.java

package com.example.webideabackend.service;

import com.example.webideabackend.model.GiteeRepoInfo;
import com.example.webideabackend.model.GitStatusResponse;
import com.example.webideabackend.util.SystemCommandExecutor;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.apache.commons.io.FileUtils;
import org.eclipse.jgit.api.*;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.Config;
import org.eclipse.jgit.lib.StoredConfig;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class GitService {

    private static final Logger LOGGER = LoggerFactory.getLogger(GitService.class);

    private static final String GITEE_USER = "wyswydx"; // Gitee 用户名
    private static final String GITEE_API_URL_TEMPLATE = "https://gitee.com/api/v5/users/" + GITEE_USER + "/repos?access_token=%s";

    @Value("${gitee.api.access-token}")
    private String giteeAccessToken;

    @Value("${gitee.ssh.private-key-path:}")
    private String giteeSshPrivateKeyPath;
    @Value("${gitee.ssh.passphrase:}")
    private String giteeSshPassphrase;

    private final Path workspaceRoot;
    private final RestTemplate restTemplate;
    private final SystemCommandExecutor commandExecutor;

    @Autowired
    public GitService(@Value("${app.workspace-root}") String workspaceRootPath,
                      RestTemplate restTemplate,
                      SystemCommandExecutor commandExecutor) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        this.restTemplate = restTemplate;
        this.commandExecutor = commandExecutor;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record GiteeApiRepo(String name, String description, GiteeApiOwner owner) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record GiteeApiOwner(String login) {}

    public List<GiteeRepoInfo> getGiteeRepositories() {
        final String apiUrl = String.format(GITEE_API_URL_TEMPLATE, giteeAccessToken);
        try {
            GiteeApiRepo[] repos = restTemplate.getForObject(apiUrl, GiteeApiRepo[].class);
            if (repos == null) return Collections.emptyList();
            return Arrays.stream(repos)
                    .map(repo -> {
                        String cloneUrl = String.format("https://gitee.com/%s/%s.git", repo.owner().login(), repo.name());
                        return new GiteeRepoInfo(repo.name(), repo.description(), cloneUrl);
                    })
                    .collect(Collectors.toList());
        } catch (Exception e) {
            LOGGER.error("Failed to fetch repositories from Gitee for user {}", GITEE_USER, e);
            return Collections.emptyList();
        }
    }

    public String cloneSpecificRepository(String repoHttpsUrl) throws GitAPIException, IOException {
        int lastSlashIndex = repoHttpsUrl.lastIndexOf('/');
        if (lastSlashIndex == -1) {
            throw new IllegalArgumentException("Invalid repository URL format: " + repoHttpsUrl);
        }
        String lastPart = repoHttpsUrl.substring(lastSlashIndex + 1);
        String projectName = lastPart.endsWith(".git") ? lastPart.substring(0, lastPart.length() - 4) : lastPart;

        if (projectName.isEmpty()) {
            throw new IllegalArgumentException("Could not determine project name from URL: " + repoHttpsUrl);
        }

        Path projectDir = workspaceRoot.resolve(projectName);
        if (Files.exists(projectDir)) {
            LOGGER.warn("Project directory {} already exists. Deleting it before clone.", projectDir);
            FileUtils.deleteDirectory(projectDir.toFile());
        }
        LOGGER.info("Cloning repository {} into {}", repoHttpsUrl, projectDir);
        try (Git git = Git.cloneRepository()
                .setURI(repoHttpsUrl)
                .setDirectory(projectDir.toFile())
                .setCredentialsProvider(new UsernamePasswordCredentialsProvider("private-token", giteeAccessToken))
                .call()) {
            LOGGER.info("Repository cloned successfully via HTTPS into: {}", git.getRepository().getDirectory());
            LOGGER.info("Switching remote 'origin' URL to SSH format for push operations...");
            String pathPart = repoHttpsUrl.replace("https://gitee.com/", "");
            String sshUrl = "git@gitee.com:" + pathPart;
            StoredConfig config = git.getRepository().getConfig();
            config.setString("remote", "origin", "url", sshUrl);
            config.save();
            LOGGER.info("Remote 'origin' URL successfully updated to: {}", sshUrl);
            return projectName;
        } catch (Exception e) {
            LOGGER.error("An error occurred during clone and setup process for {}", repoHttpsUrl, e);
            if(Files.exists(projectDir)) {
                FileUtils.deleteDirectory(projectDir.toFile());
            }
            throw new IOException("Failed during clone or SSH URL setup: " + e.getMessage(), e);
        }
    }

    private Git openRepository(String projectPath) throws IOException {
        Path repoDir = workspaceRoot.resolve(projectPath);
        if (!Files.exists(repoDir.resolve(".git"))) {
            throw new IllegalStateException("Git repository not found in project path: " + projectPath);
        }
        return Git.open(repoDir.toFile());
    }

    public GitStatusResponse getStatus(String projectPath) throws GitAPIException, IOException {
        Path repoDir = workspaceRoot.resolve(projectPath);
        if (!Files.exists(repoDir) || !Files.isDirectory(repoDir) || !Files.exists(repoDir.resolve(".git"))) {
            return GitStatusResponse.builder().currentBranch("not-a-repo").isClean(true).added(Collections.emptySet()).modified(Collections.emptySet()).deleted(Collections.emptySet()).untracked(Collections.emptySet()).conflicting(Collections.emptySet()).build();
        }
        try (Git git = Git.open(repoDir.toFile())) {
            Status status = git.status().call();
            return GitStatusResponse.builder().currentBranch(git.getRepository().getBranch()).isClean(status.isClean()).added(status.getAdded()).modified(status.getModified()).deleted(status.getRemoved()).untracked(status.getUntracked()).conflicting(status.getConflicting()).build();
        }
    }

    public void commit(String projectPath, String message, String authorName, String authorEmail) throws GitAPIException, IOException {
        try (Git git = openRepository(projectPath)) {
            LOGGER.info("Performing git commit on '{}' with message: '{}'", projectPath, message);
            git.add().addFilepattern(".").call();
            git.commit().setMessage(message).setAuthor(authorName, authorEmail).call();
        }
    }

    // ========================= 关键修改 START =========================
    /**
     * 【根本性解决方案】
     * 使用 SystemCommandExecutor 来调用系统原生的 'git pull' 命令。
     * 这与 'push' 方法的实现保持一致，可以绕过 JGit 的 SSH 密钥格式和会话工厂问题，
     * 直接利用系统已经配置好的、并且经过验证可以正常工作的 Git 和 SSH 环境。
     *
     * @param projectPath 要执行拉取的项目路径
     * @return 包含拉取结果消息的字符串
     * @throws IOException 如果命令执行过程中发生 I/O 错误
     * @throws GitAPIException 如果 Git 命令返回非零退出码，表示拉取失败
     */
    public String pull(String projectPath) throws IOException, GitAPIException {
        if (!StringUtils.hasText(projectPath)) {
            throw new IllegalArgumentException("Project path cannot be empty.");
        }
        File projectDir = workspaceRoot.resolve(projectPath).toFile();
        if (!projectDir.exists() || !new File(projectDir, ".git").exists()) {
            throw new IllegalStateException("Project is not a valid Git repository.");
        }

        LOGGER.info("Performing git pull for project '{}' by executing native git command...", projectPath);

        List<String> command = List.of("git", "pull");
        StringBuilder output = new StringBuilder();

        CompletableFuture<Integer> future = commandExecutor.executeCommand(command, projectDir, line -> {
            output.append(line).append("\n");
        });

        try {
            int exitCode = future.get(); // 等待命令执行完成
            String commandOutput = output.toString().trim();

            if (exitCode == 0) {
                LOGGER.info("Native git pull completed successfully for project '{}'.", projectPath);
                if (commandOutput.isEmpty() || commandOutput.contains("Already up to date.") || commandOutput.contains("已经是最新")) {
                    return "Pull successful. Already up-to-date.";
                }
                return "Pull successful.\n" + commandOutput;
            } else {
                String errorMessage = "Pull failed with exit code: " + exitCode + ".\nOutput:\n" + commandOutput;
                LOGGER.error(errorMessage);
                // 抛出一个具体的异常，这样 Controller 层可以捕获并返回一个合适的 HTTP 错误
                throw new GitAPIException(errorMessage) {};
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            LOGGER.error("Error waiting for native git pull command to finish for project '{}'", projectPath, e);
            throw new IOException("Failed to execute git pull command.", e);
        }
    }
    // ========================= 关键修改 END ===========================


    public Map<String, Object> push(String projectPath) throws IOException, GitAPIException {
        if (!StringUtils.hasText(projectPath)) {
            throw new IllegalArgumentException("Project path cannot be empty.");
        }

        File projectDir = workspaceRoot.resolve(projectPath).toFile();
        if (!projectDir.exists() || !new File(projectDir, ".git").exists()) {
            throw new IllegalStateException("Project is not a valid Git repository.");
        }

        // 1. 获取远程URL以便后续转换和返回
        String remoteUrl;
        try (Git git = Git.open(projectDir)) {
            Config storedConfig = git.getRepository().getConfig();
            remoteUrl = storedConfig.getString("remote", "origin", "url");
            if (remoteUrl == null) {
                throw new IOException("Could not find remote 'origin' URL in git config.");
            }
        }

        LOGGER.info("Performing git push for project '{}' by executing native git command...", projectPath);

        List<String> command = List.of("git", "push");
        StringBuilder output = new StringBuilder();

        CompletableFuture<Integer> future = commandExecutor.executeCommand(command, projectDir, line -> {
            output.append(line).append("\n");
        });

        try {
            int exitCode = future.get();
            String commandOutput = output.toString();

            if (exitCode == 0) {
                LOGGER.info("Native git push completed successfully for project '{}'.", projectPath);

                // 2. 转换URL为可浏览格式
                String browseableUrl = convertSshToHttps(remoteUrl);

                // 3. 构造包含消息和URL的响应
                Map<String, Object> result = new HashMap<>();
                result.put("message", "Push successful.\n" + commandOutput);
                result.put("repoUrl", browseableUrl);
                return result;
            } else {
                String errorMessage = "Push failed with exit code: " + exitCode + ".\nOutput:\n" + commandOutput;
                LOGGER.error(errorMessage);
                throw new GitAPIException(errorMessage) {};
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            LOGGER.error("Error waiting for native git push command to finish for project '{}'", projectPath, e);
            throw new IOException("Failed to execute git push command.", e);
        }
    }

    private String convertSshToHttps(String sshUrl) {
        if (sshUrl != null && sshUrl.startsWith("git@gitee.com:")) {
            return sshUrl.replace("git@gitee.com:", "https://gitee.com/")
                    .replaceAll("\\.git$", "");
        }
        return sshUrl;
    }
}