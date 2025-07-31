package com.example.webideabackend.service;

import com.example.webideabackend.model.GiteeRepoInfo;
import com.example.webideabackend.model.GitStatusResponse;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.apache.commons.io.FileUtils;
import org.eclipse.jgit.api.*;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.transport.SshTransport;
import org.eclipse.jgit.transport.ssh.jsch.JschConfigSessionFactory;
import org.eclipse.jgit.transport.ssh.jsch.OpenSshConfig;
import org.eclipse.jgit.util.FS;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@Service
public class GitService {

    private static final Logger LOGGER = LoggerFactory.getLogger(GitService.class);

    private static final String GITEE_USER = "wyswydx"; // Gitee 用户名
    private static final String GITEE_API_URL = "https://gitee.com/api/v5/users/" + GITEE_USER + "/repos";

    // ========================= 关键修改 START =========================
    /**
     * SSH私钥。
     * 此值通过 Spring 从环境变量 'GITEE_PACKAGE_PEM_RSA_PRIVATE_KEY' 中注入。
     * 类似于 Python 的 os.environ.get("...").
     */
    @Value("${GITEE_PACKAGE_PEM_RSA_PRIVATE_KEY}")
    private String giteePrivateKey;
    // ========================= 关键修改 END ===========================


    private final Path workspaceRoot;
    private final RestTemplate restTemplate;

    @Autowired
    public GitService(@Value("${app.workspace-root}") String workspaceRootPath, RestTemplate restTemplate) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        this.restTemplate = restTemplate;
    }

    public List<GiteeRepoInfo> getGiteeRepositories() {
        try {
            GiteeRepoInfo[] repos = restTemplate.getForObject(GITEE_API_URL, GiteeRepoInfo[].class);
            return repos != null ? Arrays.asList(repos) : Collections.emptyList();
        } catch (Exception e) {
            LOGGER.error("Failed to fetch repositories from Gitee for user {}", GITEE_USER, e);
            return Collections.emptyList();
        }
    }

    public String cloneSpecificRepository(String repoSshUrl) throws GitAPIException, IOException {
        String projectName = repoSshUrl.substring(repoSshUrl.lastIndexOf('/') + 1, repoSshUrl.lastIndexOf('.'));
        Path projectDir = workspaceRoot.resolve(projectName);

        if (Files.exists(projectDir)) {
            LOGGER.warn("Project directory {} already exists. Deleting it before clone.", projectDir);
            FileUtils.deleteDirectory(projectDir.toFile());
        }

        LOGGER.info("Cloning repository {} into {}", repoSshUrl, projectDir);
        try (Git result = Git.cloneRepository()
                .setURI(repoSshUrl)
                .setDirectory(projectDir.toFile())
                .setTransportConfigCallback(createSshTransportConfigCallback())
                .call()) {
            LOGGER.info("Repository cloned into: {}", result.getRepository().getDirectory());
            return projectName;
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

    public void commit(String projectPath, String message, String authorName, String authorEmail) throws GitAPIException, IOException {
        try (Git git = openRepository(projectPath)) {
            LOGGER.info("Performing git commit on '{}' with message: '{}'", projectPath, message);
            git.commit()
                    .setMessage(message)
                    .setAuthor(authorName, authorEmail)
                    .setAll(true)
                    .call();
        }
    }

    public String pull(String projectPath) throws GitAPIException, IOException {
        try (Git git = openRepository(projectPath)) {
            LOGGER.info("Performing git pull for project '{}', configuring SSH transport...", projectPath);
            PullCommand pullCommand = git.pull();
            pullCommand.setTransportConfigCallback(createSshTransportConfigCallback());
            PullResult result = pullCommand.call();

            if (result.isSuccessful()) {
                return "Pull successful. Fetched from " + result.getFetchedFrom() + ".";
            } else {
                return "Pull failed: " + result.getMergeResult().getMergeStatus();
            }
        }
    }

    public String push(String projectPath) throws GitAPIException, IOException {
        try (Git git = openRepository(projectPath)) {
            LOGGER.info("Performing git push for project '{}', configuring SSH transport...", projectPath);
            PushCommand pushCommand = git.push();
            pushCommand.setTransportConfigCallback(createSshTransportConfigCallback());
            pushCommand.call();
            return "Push successful.";
        }
    }

    /**
     * 创建一个可重用的 TransportConfigCallback，用于配置 JGit 使用 SSH 密钥进行认证。
     * @return 配置好的 TransportConfigCallback 实例。
     */
    private TransportConfigCallback createSshTransportConfigCallback() {
        JschConfigSessionFactory sshSessionFactory = new JschConfigSessionFactory() {
            @Override
            protected void configure(OpenSshConfig.Host hc, Session session) {
                // 禁用严格的主机密钥检查，简化演示环境的连接
                session.setConfig("StrictHostKeyChecking", "no");
            }

            @Override
            protected JSch getJSch(final OpenSshConfig.Host hc, FS fs) throws JSchException {
                JSch jsch = super.getJSch(hc, fs);
                jsch.removeAllIdentity(); // 清除所有旧的身份

                // 检查从环境变量注入的私钥是否存在
                if (giteePrivateKey == null || giteePrivateKey.trim().isEmpty()) {
                    throw new JSchException("SSH private key is not configured. Please set the 'GITEE_PACKAGE_PEM_RSA_PRIVATE_KEY' environment variable.");
                }

                // 确保私钥格式正确
                String privateKeyContent = giteePrivateKey.replace("\r\n", "\n");
                if (!privateKeyContent.endsWith("\n")) {
                    privateKeyContent += "\n";
                }
                byte[] privateKeyBytes = privateKeyContent.getBytes(StandardCharsets.UTF_8);
                // 从字节数组加载私钥
                // 此方法需要私钥、公钥和密码。当公钥为null时，JSch会尝试从私钥中推导。
                // 只要私钥格式正确（PEM），这个调用就是有效的。
                jsch.addIdentity("gitee-demo-key", privateKeyBytes, null, null);
                return jsch;
            }
        };

        return transport -> {
            if (transport instanceof SshTransport) {
                ((SshTransport) transport).setSshSessionFactory(sshSessionFactory);
            }
        };
    }
}