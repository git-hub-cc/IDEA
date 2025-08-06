// 文件: src/main/java/com/example/webideabackend/service/GitService.java

package com.example.webideabackend.service;

import com.example.webideabackend.model.RemoteRepoInfo;
import com.example.webideabackend.model.GitStatusResponse;
import com.example.webideabackend.model.Settings;
import com.example.webideabackend.util.SystemCommandExecutor;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
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

    private static final String GITEE_API_URL_TEMPLATE = "https://gitee.com/api/v5/user/repos?access_token=%s";
    private static final String GITHUB_API_URL = "https://api.github.com/user/repos";

    @Value("${gitee.api.access-token}")
    private String giteeAccessTokenFromProps;

    private final SettingsService settingsService;
    private final RestTemplate restTemplate;
    private final SystemCommandExecutor commandExecutor;

    // ========================= 关键修改 START: 移除 @Value 注入 =========================
    @Autowired
    public GitService(RestTemplate restTemplate,
                      SystemCommandExecutor commandExecutor,
                      SettingsService settingsService) {
        // 移除了 @Value("${app.workspace-root}") String workspaceRootPath 参数
        // 移除了 this.workspaceRoot = ... 的初始化代码
        this.restTemplate = restTemplate;
        this.commandExecutor = commandExecutor;
        this.settingsService = settingsService;
    }

    /**
     * 动态获取最新的工作区根目录。
     * @return 当前配置的工作区根目录的 Path 对象。
     */
    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        if (workspaceRootPath == null || workspaceRootPath.isBlank()) {
            workspaceRootPath = "./workspace"; // 安全回退
        }
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }
    // ========================= 关键修改 END ========================================

    // --- DTOs for different Git providers ---
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record GiteeApiRepo(String name, String description, @JsonProperty("html_url") String htmlUrl) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record GitHubApiRepo(String name, String description, @JsonProperty("clone_url") String cloneUrl) {}


    public List<RemoteRepoInfo> getRemoteRepositories() {
        Settings settings = settingsService.getSettings();
        String platform = settings.getGitPlatform() != null ? settings.getGitPlatform() : "gitee";
        String accessToken = settings.getGiteeAccessToken();

        if (!StringUtils.hasText(accessToken)) {
            accessToken = this.giteeAccessTokenFromProps;
        }
        if (!StringUtils.hasText(accessToken)) {
            LOGGER.warn("未配置访问令牌，无法获取远程仓库列表。");
            return Collections.emptyList();
        }

        if ("github".equalsIgnoreCase(platform)) {
            return getGitHubRepositories(accessToken);
        } else {
            return getGiteeRepositories(accessToken);
        }
    }

    private List<RemoteRepoInfo> getGiteeRepositories(String accessToken) {
        final String apiUrl = String.format(GITEE_API_URL_TEMPLATE, accessToken);
        try {
            GiteeApiRepo[] repos = restTemplate.getForObject(apiUrl, GiteeApiRepo[].class);
            if (repos == null) return Collections.emptyList();
            return Arrays.stream(repos)
                    .map(repo -> new RemoteRepoInfo(repo.name(), repo.description(), repo.htmlUrl() + ".git"))
                    .collect(Collectors.toList());
        } catch (Exception e) {
            LOGGER.error("从 Gitee 获取仓库失败", e);
            return Collections.emptyList();
        }
    }

    private List<RemoteRepoInfo> getGitHubRepositories(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + accessToken);
        headers.set("Accept", "application/vnd.github.v3+json");
        HttpEntity<String> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<GitHubApiRepo[]> response = restTemplate.exchange(GITHUB_API_URL, HttpMethod.GET, entity, GitHubApiRepo[].class);
            GitHubApiRepo[] repos = response.getBody();
            if (repos == null) return Collections.emptyList();
            return Arrays.stream(repos)
                    .map(repo -> new RemoteRepoInfo(repo.name(), repo.description(), repo.cloneUrl()))
                    .collect(Collectors.toList());
        } catch (Exception e) {
            LOGGER.error("从 GitHub 获取仓库失败", e);
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

        String accessToken = settingsService.getSettings().getGiteeAccessToken();
        if (!StringUtils.hasText(accessToken)) {
            accessToken = this.giteeAccessTokenFromProps;
        }

        // ========================= 关键修改 START: 使用动态路径 =========================
        Path projectDir = getWorkspaceRoot().resolve(projectName);
        // ========================= 关键修改 END ========================================

        if (Files.exists(projectDir)) {
            LOGGER.warn("Project directory {} already exists. Deleting it before clone.", projectDir);
            FileUtils.deleteDirectory(projectDir.toFile());
        }
        LOGGER.info("Cloning repository {} into {}", repoHttpsUrl, projectDir);
        try (Git git = Git.cloneRepository()
                .setURI(repoHttpsUrl)
                .setDirectory(projectDir.toFile())
                .setCredentialsProvider(new UsernamePasswordCredentialsProvider(accessToken, "")) // GitHub/Gitee都支持用token作为用户名或密码
                .call()) {
            LOGGER.info("Repository cloned successfully via HTTPS into: {}", git.getRepository().getDirectory());

            // 切换为SSH URL
            String remoteUrl = repoHttpsUrl.replace("https://", "");
            String domain = remoteUrl.substring(0, remoteUrl.indexOf('/'));
            String pathPart = remoteUrl.substring(remoteUrl.indexOf('/'));

            String sshUrl = String.format("git@%s:%s", domain, pathPart.startsWith("/") ? pathPart.substring(1) : pathPart);

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
        // ========================= 关键修改 START: 使用动态路径 =========================
        Path repoDir = getWorkspaceRoot().resolve(projectPath);
        // ========================= 关键修改 END ========================================
        if (!Files.exists(repoDir.resolve(".git"))) {
            throw new IllegalStateException("Git repository not found in project path: " + projectPath);
        }
        return Git.open(repoDir.toFile());
    }

    public GitStatusResponse getStatus(String projectPath) throws GitAPIException, IOException {
        // ========================= 关键修改 START: 使用动态路径 =========================
        Path repoDir = getWorkspaceRoot().resolve(projectPath);
        // ========================= 关键修改 END ========================================
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

    public String pull(String projectPath) throws IOException, GitAPIException {
        if (!StringUtils.hasText(projectPath)) {
            throw new IllegalArgumentException("Project path cannot be empty.");
        }
        // ========================= 关键修改 START: 使用动态路径 =========================
        File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
        // ========================= 关键修改 END ========================================
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
                throw new GitAPIException(errorMessage) {};
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            LOGGER.error("Error waiting for native git pull command to finish for project '{}'", projectPath, e);
            throw new IOException("Failed to execute git pull command.", e);
        }
    }


    public Map<String, Object> push(String projectPath) throws IOException, GitAPIException {
        if (!StringUtils.hasText(projectPath)) {
            throw new IllegalArgumentException("Project path cannot be empty.");
        }

        // ========================= 关键修改 START: 使用动态路径 =========================
        File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
        // ========================= 关键修改 END ========================================
        if (!projectDir.exists() || !new File(projectDir, ".git").exists()) {
            throw new IllegalStateException("Project is not a valid Git repository.");
        }

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

                String browseableUrl = convertGitUrlToBrowsableHttps(remoteUrl);

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

    private String convertGitUrlToBrowsableHttps(String gitUrl) {
        if (gitUrl == null || gitUrl.trim().isEmpty()) {
            return gitUrl;
        }

        String browsableUrl = gitUrl;

        // 处理SSH格式
        if (gitUrl.startsWith("git@")) {
            browsableUrl = "https://" + gitUrl.substring(4).replaceFirst(":", "/");
        }

        // 为SSH转换后或原始的HTTPS链接移除.git后缀
        if (browsableUrl.endsWith(".git")) {
            browsableUrl = browsableUrl.substring(0, browsableUrl.length() - 4);
        }

        return browsableUrl;
    }
}