
package com.example.webideabackend.service;

import com.example.webideabackend.model.GitStatusResponse;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.PullResult;
import org.eclipse.jgit.api.Status;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.Repository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.File;
import java.io.IOException;

@Service
public class GitService {

    private static final Logger LOGGER = LoggerFactory.getLogger(GitService.class);

    private final File workspaceRoot;
    private Git git;
    private Repository repository;

    public GitService(@Value("${app.workspace-root}") String workspaceRootPath) {
        this.workspaceRoot = new File(workspaceRootPath);
    }

    @PostConstruct
    public void init() {
        try {
            this.git = Git.open(workspaceRoot);
            this.repository = git.getRepository();
            LOGGER.info("Git repository opened successfully at: {}", repository.getDirectory());
        } catch (IOException e) {
            LOGGER.warn("No Git repository found in workspace root: {}. Git functionality will be disabled.", workspaceRoot.getAbsolutePath());
            this.git = null;
            this.repository = null;
        }
    }

    @PreDestroy
    public void close() {
        if (this.repository != null) {
            this.repository.close();
        }
        if (this.git != null) {
            this.git.close();
        }
        LOGGER.info("Git service resources released.");
    }

    private void ensureGitInitialized() {
        if (git == null) {
            throw new IllegalStateException("Git repository is not initialized in the workspace.");
        }
    }

    public GitStatusResponse getStatus() throws GitAPIException, IOException {
        ensureGitInitialized();
        Status status = git.status().call();

        return GitStatusResponse.builder()
                .currentBranch(repository.getBranch())
                .isClean(status.isClean())
                .added(status.getAdded())
                .modified(status.getModified())
                .deleted(status.getRemoved())
                .untracked(status.getUntracked())
                .conflicting(status.getConflicting())
                .build();
    }

    public void commit(String message, String authorName, String authorEmail) throws GitAPIException {
        ensureGitInitialized();
        // 允许提交空的修改（例如，初始提交）
        git.commit()
                .setMessage(message)
                .setAuthor(authorName, authorEmail)
                .setAll(true) // Stage all modified and deleted files automatically
                .call();
    }

    public String pull() throws GitAPIException {
        ensureGitInitialized();
        PullResult result = git.pull().call();
        if (result.isSuccessful()) {
            return "Pull successful. Fetched from " + result.getFetchedFrom() + ".";
        } else {
            return "Pull failed: " + result.getMergeResult().getMergeStatus();
        }
    }

    public String push() throws GitAPIException {
        ensureGitInitialized();
        // 注意: 实际项目中这里需要处理认证 (credentials)
        git.push().call();
        return "Push successful.";
    }
}