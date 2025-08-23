/**
 * GitService.java
 *
 * 该服务封装了所有与Git相关的操作，包括克隆远程仓库、获取状态、提交、推送和拉取。
 * 它使用 JGit 库处理本地仓库操作，并使用 RestTemplate 调用 Gitee/GitHub API。
 * 对于需要认证的 push/pull 操作，它会调用本机的 `git` 命令来利用系统级的凭证管理。
 * 它依赖 SettingsService 获取工作区路径。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.GitCredentialsRequest;
import club.ppmc.idea.model.GitStatusResponse;
import club.ppmc.idea.model.RemoteRepoInfo;
import club.ppmc.idea.util.SystemCommandExecutor;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import org.apache.commons.io.FileUtils;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.Status;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.StoredConfig;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

@Service
public class GitService {

    private static final Logger LOGGER = LoggerFactory.getLogger(GitService.class);

    private static final String GITEE_API_URL_TEMPLATE = "https://gitee.com/api/v5/user/repos?access_token=%s";
    private static final String GITHUB_API_URL = "https://api.github.com/user/repos";

    private final SettingsService settingsService;
    private final RestTemplate restTemplate;
    private final SystemCommandExecutor commandExecutor;

    public GitService(
            RestTemplate restTemplate,
            SystemCommandExecutor commandExecutor,
            SettingsService settingsService) {
        this.restTemplate = restTemplate;
        this.commandExecutor = commandExecutor;
        this.settingsService = settingsService;
    }

    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    // --- 内部 DTOs，用于反序列化不同Git平台的API响应 ---
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record GiteeApiRepo(String name, String description, @JsonProperty("html_url") String htmlUrl) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record GitHubApiRepo(String name, String description, @JsonProperty("clone_url") String cloneUrl) {}

    public List<RemoteRepoInfo> getRemoteRepositories(String platform, String accessToken) {
        if (!StringUtils.hasText(accessToken)) {
            LOGGER.warn("未提供个人访问令牌，无法获取远程仓库列表。");
            return Collections.emptyList();
        }

        return "github".equalsIgnoreCase(platform)
                ? getGitHubRepositories(accessToken)
                : getGiteeRepositories(accessToken);
    }

    private List<RemoteRepoInfo> getGiteeRepositories(String accessToken) {
        final String apiUrl = String.format(GITEE_API_URL_TEMPLATE, accessToken);
        try {
            GiteeApiRepo[] repos = restTemplate.getForObject(apiUrl, GiteeApiRepo[].class);
            if (repos == null) return Collections.emptyList();
            return Arrays.stream(repos)
                    .map(repo -> new RemoteRepoInfo(repo.name(), repo.description(), repo.htmlUrl() + ".git"))
                    .toList();
        } catch (Exception e) {
            LOGGER.error("从 Gitee API 获取仓库列表失败", e);
            return Collections.emptyList();
        }
    }

    private List<RemoteRepoInfo> getGitHubRepositories(String accessToken) {
        var headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + accessToken);
        headers.set("Accept", "application/vnd.github.v3+json");
        var entity = new HttpEntity<String>(headers);

        try {
            ResponseEntity<GitHubApiRepo[]> response =
                    restTemplate.exchange(GITHUB_API_URL, HttpMethod.GET, entity, GitHubApiRepo[].class);
            GitHubApiRepo[] repos = response.getBody();
            if (repos == null) return Collections.emptyList();
            return Arrays.stream(repos)
                    .map(repo -> new RemoteRepoInfo(repo.name(), repo.description(), repo.cloneUrl()))
                    .toList();
        } catch (Exception e) {
            LOGGER.error("从 GitHub API 获取仓库列表失败", e);
            return Collections.emptyList();
        }
    }

    public String cloneSpecificRepository(String repoHttpsUrl, String accessToken) throws GitAPIException, IOException {
        String projectName = extractProjectNameFromUrl(repoHttpsUrl);
        Path projectDir = getWorkspaceRoot().resolve(projectName);

        if (Files.exists(projectDir)) {
            LOGGER.warn("项目目录 {} 已存在。将在克隆前删除它。", projectDir);
            FileUtils.deleteDirectory(projectDir.toFile());
        }

        LOGGER.info("正在克隆仓库 {} 到 {}", repoHttpsUrl, projectDir);

        try (Git git =
                     Git.cloneRepository()
                             .setURI(repoHttpsUrl)
                             .setDirectory(projectDir.toFile())
                             .setCredentialsProvider(new UsernamePasswordCredentialsProvider(accessToken, ""))
                             .call()) {
            LOGGER.info("仓库已通过HTTPS成功克隆到: {}", git.getRepository().getDirectory());

            String sshUrl = convertHttpsToSshUrl(repoHttpsUrl);
            StoredConfig config = git.getRepository().getConfig();
            config.setString("remote", "origin", "url", sshUrl);
            config.save();
            LOGGER.info("远程 'origin' URL已成功更新为: {}", sshUrl);

            return projectName;
        } catch (Exception e) {
            LOGGER.error("克隆或设置SSH URL过程中发生错误 for {}", repoHttpsUrl, e);
            if (Files.exists(projectDir)) {
                FileUtils.deleteDirectory(projectDir.toFile());
            }
            throw new IOException("克隆或设置SSH URL失败: " + e.getMessage(), e);
        }
    }

    public GitStatusResponse getStatus(String projectPath) throws GitAPIException, IOException {
        Path repoDir = getWorkspaceRoot().resolve(projectPath);
        if (!Files.exists(repoDir.resolve(".git"))) {
            return GitStatusResponse.builder()
                    .currentBranch("not-a-repo")
                    .isClean(true)
                    .added(Collections.emptySet())
                    .modified(Collections.emptySet())
                    .deleted(Collections.emptySet())
                    .untracked(Collections.emptySet())
                    .conflicting(Collections.emptySet())
                    .build();
        }
        try (Git git = Git.open(repoDir.toFile())) {
            Status status = git.status().call();
            return GitStatusResponse.builder()
                    .currentBranch(git.getRepository().getBranch())
                    .isClean(status.isClean())
                    .added(status.getAdded())
                    .modified(status.getModified())
                    .deleted(status.getRemoved())
                    .untracked(status.getUntracked())
                    .conflicting(status.getConflicting())
                    .build();
        }
    }

    public void commit(String projectPath, String message, String authorName, String authorEmail)
            throws GitAPIException, IOException {
        try (Git git = openRepository(projectPath)) {
            LOGGER.info("在 '{}' 上执行 git commit，消息: '{}'", projectPath, message);
            git.add().addFilepattern(".").call();
            git.commit().setMessage(message).setAuthor(authorName, authorEmail).call();
        }
    }

    public String pull(String projectPath, GitCredentialsRequest credentials) throws IOException, GitAPIException {
        return executeNativeGitCommand(projectPath, List.of("git", "pull"), "拉取", "Pull", credentials);
    }

    public Map<String, Object> push(String projectPath, GitCredentialsRequest credentials) throws IOException, GitAPIException {
        String output = executeNativeGitCommand(projectPath, List.of("git", "push"), "推送", "Push", credentials);

        String remoteUrl;
        try (Git git = openRepository(projectPath)) {
            remoteUrl = git.getRepository().getConfig().getString("remote", "origin", "url");
        }

        return Map.of("message", "推送成功。\n" + output, "repoUrl", convertGitUrlToBrowsableHttps(remoteUrl));
    }

    private String executeNativeGitCommand(
            String projectPath, List<String> command, String opNameChinese, String opNameEnglish, GitCredentialsRequest credentials)
            throws IOException, GitAPIException {
        File projectDir = getValidatedProjectDir(projectPath);
        LOGGER.info("正在为项目 '{}' 执行原生git命令: {}", projectPath, String.join(" ", command));

        // 为SSH操作设置环境变量
        Map<String, String> env = new HashMap<>();
        if (StringUtils.hasText(credentials.sshKeyPath())) {
            env.put("GIT_SSH_COMMAND", "ssh -i " + credentials.sshKeyPath());
        }

        var output = new StringBuilder();
        try {
            int exitCode = commandExecutor.executeCommand(command, projectDir, env, line -> output.append(line).append("\n")).get();
            String commandOutput = output.toString().trim();

            if (exitCode == 0) {
                LOGGER.info("原生 git {} 为项目 '{}' 成功完成。", opNameEnglish.toLowerCase(), projectPath);
                if (commandOutput.isEmpty() || commandOutput.contains("Already up to date") || commandOutput.contains("已经是最新")) {
                    return opNameChinese + "成功。已是最新。";
                }
                return opNameChinese + "成功。\n" + commandOutput;
            } else {
                String errorMessage = opNameChinese + "失败，退出码: " + exitCode + "。\n输出:\n" + commandOutput;
                LOGGER.error(errorMessage);
                throw new GitAPIException(errorMessage) {};
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            LOGGER.error("等待原生 git {} 命令为项目 '{}' 完成时出错", opNameEnglish.toLowerCase(), projectPath, e);
            throw new IOException("执行 git " + opNameEnglish.toLowerCase() + " 命令失败。", e);
        }
    }

    private Git openRepository(String projectPath) throws IOException {
        return Git.open(getValidatedProjectDir(projectPath));
    }

    private File getValidatedProjectDir(String projectPath) {
        if (!StringUtils.hasText(projectPath)) {
            throw new IllegalArgumentException("项目路径不能为空。");
        }
        File projectDir = getWorkspaceRoot().resolve(projectPath).toFile();
        if (!projectDir.exists() || !new File(projectDir, ".git").exists()) {
            throw new IllegalStateException("项目不是一个有效的Git仓库: " + projectPath);
        }
        return projectDir;
    }

    private String extractProjectNameFromUrl(String url) {
        int lastSlashIndex = url.lastIndexOf('/');
        if (lastSlashIndex == -1) {
            throw new IllegalArgumentException("无效的仓库URL格式: " + url);
        }
        String lastPart = url.substring(lastSlashIndex + 1);
        String projectName = lastPart.endsWith(".git") ? lastPart.substring(0, lastPart.length() - 4) : lastPart;
        if (projectName.isEmpty()) {
            throw new IllegalArgumentException("无法从URL中确定项目名称: " + url);
        }
        return projectName;
    }

    private String convertHttpsToSshUrl(String httpsUrl) {
        return httpsUrl.replaceFirst("https://", "git@").replaceFirst("/", ":");
    }

    private String convertGitUrlToBrowsableHttps(String gitUrl) {
        if (!StringUtils.hasText(gitUrl)) return "";

        String browsableUrl = gitUrl;
        if (gitUrl.startsWith("git@")) {
            browsableUrl = "https://" + gitUrl.substring(4).replaceFirst(":", "/");
        }
        if (browsableUrl.endsWith(".git")) {
            browsableUrl = browsableUrl.substring(0, browsableUrl.length() - 4);
        }
        return browsableUrl;
    }
}