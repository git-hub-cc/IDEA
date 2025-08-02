// 文件: src/main/java/com/example/webideabackend/service/GitService.java

package com.example.webideabackend.service;

import com.example.webideabackend.model.GiteeRepoInfo;
import com.example.webideabackend.model.GitStatusResponse;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.apache.commons.io.FileUtils;
import org.eclipse.jgit.api.*;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.StoredConfig;
import org.eclipse.jgit.transport.*;
import org.eclipse.jgit.transport.ssh.jsch.JschConfigSessionFactory;
import org.eclipse.jgit.transport.ssh.jsch.OpenSshConfig;
import org.eclipse.jgit.util.FS;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
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

    @Autowired
    public GitService(@Value("${app.workspace-root}") String workspaceRootPath, RestTemplate restTemplate) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        this.restTemplate = restTemplate;
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

    // ========================= 关键修改 START =========================
    public String cloneSpecificRepository(String repoHttpsUrl) throws GitAPIException, IOException {
        // 使用更健壮的逻辑来提取项目名称
        int lastSlashIndex = repoHttpsUrl.lastIndexOf('/');
        if (lastSlashIndex == -1) {
            throw new IllegalArgumentException("Invalid repository URL format: " + repoHttpsUrl);
        }
        String lastPart = repoHttpsUrl.substring(lastSlashIndex + 1);
        String projectName = lastPart.endsWith(".git") ? lastPart.substring(0, lastPart.length() - 4) : lastPart;

        if (projectName.isEmpty()) {
            throw new IllegalArgumentException("Could not determine project name from URL: " + repoHttpsUrl);
        }
        // ========================= 关键修改 END ===========================

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
    public String pull(String projectPath) throws GitAPIException, IOException {
        try (Git git = openRepository(projectPath)) {
            LOGGER.info("Performing git pull for project '{}' via HTTPS...", projectPath);
            PullCommand pullCommand = git.pull();
            pullCommand.setCredentialsProvider(new UsernamePasswordCredentialsProvider("private-token", giteeAccessToken));
            PullResult result = pullCommand.call();
            if (result.isSuccessful()) {
                return "Pull successful. Fetched from " + result.getFetchedFrom() + ".";
            } else {
                return "Pull failed: " + result.getMergeResult().getMergeStatus();
            }
        }
    }

    public String push(String projectPath) throws GitAPIException, IOException {
        if (!StringUtils.hasText(giteeSshPrivateKeyPath)) {
            throw new IllegalStateException("SSH private key path is not configured. Please set 'gitee.ssh.private-key-path' in your application properties.");
        }

        Path privateKeyFile = Paths.get(giteeSshPrivateKeyPath);
        if (!Files.exists(privateKeyFile)) {
            throw new IOException("SSH private key file not found at path: " + giteeSshPrivateKeyPath);
        }

        byte[] privateKeyBytes = Files.readAllBytes(privateKeyFile);

        SshSessionFactory sshSessionFactory = new JschConfigSessionFactory() {
            @Override
            protected void configure(OpenSshConfig.Host hc, Session session) {
                session.setConfig("StrictHostKeyChecking", "no");
            }

            @Override
            protected JSch createDefaultJSch(FS fs) throws JSchException {
                JSch defaultJSch = super.createDefaultJSch(fs);
                byte[] passphraseBytes = StringUtils.hasText(giteeSshPassphrase) ?
                        giteeSshPassphrase.getBytes(StandardCharsets.UTF_8) : null;

                defaultJSch.addIdentity(
                        "gitee-ssh-key-for-push",
                        privateKeyBytes,
                        null,
                        passphraseBytes
                );
                return defaultJSch;
            }
        };

        try (Git git = openRepository(projectPath)) {
            LOGGER.info("Performing git push for project '{}' via SSH using key from '{}'...", projectPath, giteeSshPrivateKeyPath);
            PushCommand pushCommand = git.push();

            pushCommand.setTransportConfigCallback(transport -> {
                if (transport instanceof SshTransport) {
                    SshTransport sshTransport = (SshTransport) transport;
                    sshTransport.setSshSessionFactory(sshSessionFactory);
                }
            });

            Iterable<PushResult> results = pushCommand.call();
            StringBuilder resultMessage = new StringBuilder("Push operation summary:\n");
            results.forEach(result -> {
                if (result.getMessages().length() > 0) {
                    resultMessage.append(result.getMessages());
                }
                result.getRemoteUpdates().forEach(update -> {
                    resultMessage.append(" - ")
                            .append(update.getRemoteName())
                            .append(": ")
                            .append(update.getStatus())
                            .append("\n");
                });
            });

            LOGGER.info("Push operation finished.");
            return resultMessage.toString();
        }
    }
}