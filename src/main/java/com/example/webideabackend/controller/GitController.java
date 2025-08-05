package com.example.webideabackend.controller;

import com.example.webideabackend.model.GitStatusResponse;
import com.example.webideabackend.model.RemoteRepoInfo;
import com.example.webideabackend.service.GitService;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/git")
public class GitController {

    private static final Logger LOGGER = LoggerFactory.getLogger(GitController.class);
    private final GitService gitService;

    @Autowired
    public GitController(GitService gitService) {
        this.gitService = gitService;
    }

    /**
     * 根据用户在设置中配置的平台（Gitee/GitHub）获取其公开仓库列表。
     *
     * @return 仓库信息列表的ResponseEntity。
     */
    @GetMapping("/remote-repos")
    public ResponseEntity<List<RemoteRepoInfo>> getRemoteRepos() {
        List<RemoteRepoInfo> repos = gitService.getRemoteRepositories();
        return ResponseEntity.ok(repos);
    }

    /**
     * 克隆一个指定的远程仓库到工作区。
     * 此操作与当前活动项目无关，它会在工作区根目录下创建一个新项目。
     *
     * @param payload 包含 "cloneUrl" 的请求体。
     * @return 包含新项目名称的ResponseEntity。
     */
    @PostMapping("/clone-specific")
    public ResponseEntity<?> cloneSpecificRepository(@RequestBody Map<String, String> payload) {
        String repoCloneUrl = payload.get("cloneUrl");
        if (repoCloneUrl == null || repoCloneUrl.isBlank()) {
            return ResponseEntity.badRequest().body("cloneUrl cannot be empty.");
        }

        try {
            String projectName = gitService.cloneSpecificRepository(repoCloneUrl);
            return ResponseEntity.ok(Map.of("projectName", projectName));
        } catch (GitAPIException | IOException e) {
            LOGGER.error("Failed to clone specific repository {}", repoCloneUrl, e);
            return ResponseEntity.internalServerError().body("Failed to clone repository: " + e.getMessage());
        } catch (Exception e) {
            LOGGER.error("An unexpected error occurred during specific clone of {}", repoCloneUrl, e);
            return ResponseEntity.internalServerError().body("An unexpected error occurred: " + e.getMessage());
        }
    }

    /**
     * 获取指定项目的Git状态。
     * 使 projectPath 参数可选，以处理没有活动项目时的前端调用。
     *
     * @param projectPath 项目的名称/路径 (可选).
     * @return Git状态信息的ResponseEntity。
     */
    @GetMapping("/status")
    public ResponseEntity<?> getStatus(@RequestParam(required = false) String projectPath) {
        // 如果没有提供 projectPath (例如，没有活动项目)，返回一个表示“不适用”的默认状态
        if (projectPath == null || projectPath.isBlank()) {
            GitStatusResponse noProjectStatus = GitStatusResponse.builder()
                    .currentBranch("N/A") // N/A 表示不适用
                    .isClean(true)
                    .added(Collections.emptySet())
                    .modified(Collections.emptySet())
                    .deleted(Collections.emptySet())
                    .untracked(Collections.emptySet())
                    .conflicting(Collections.emptySet())
                    .build();
            return ResponseEntity.ok(noProjectStatus);
        }
        try {
            GitStatusResponse status = gitService.getStatus(projectPath);
            return ResponseEntity.ok(status);
        } catch (GitAPIException | IOException e) {
            LOGGER.error("Failed to get Git status for project '{}'", projectPath, e);
            return ResponseEntity.internalServerError().body("Failed to get Git status: " + e.getMessage());
        }
    }

    /**
     * 在指定项目中执行Git提交。
     *
     * @param payload 包含 "projectPath" 和 "message" 的请求体。
     * @return 操作结果的ResponseEntity。
     */
    @PostMapping("/commit")
    public ResponseEntity<?> commit(@RequestBody Map<String, String> payload) {
        String projectPath = payload.get("projectPath");
        String message = payload.get("message");
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body("projectPath cannot be empty.");
        }
        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body("Commit message cannot be empty.");
        }

        try {
            String authorName = payload.getOrDefault("authorName", "WebApp User");
            String authorEmail = payload.getOrDefault("authorEmail", "user@example.com");
            gitService.commit(projectPath, message, authorName, authorEmail);
            return ResponseEntity.ok("Commit successful.");
        } catch (GitAPIException | IOException e) {
            LOGGER.error("Failed to commit for project '{}'", projectPath, e);
            return ResponseEntity.internalServerError().body("Failed to commit: " + e.getMessage());
        } catch (IllegalStateException e) {
            LOGGER.warn("Bad request on commit for project '{}': {}", projectPath, e.getMessage());
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 在指定项目中执行Git拉取。
     *
     * @param projectPath 项目的名称/路径 (可选)。
     * @return 操作结果的ResponseEntity。
     */
    @PostMapping("/pull")
    public ResponseEntity<?> pull(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body("No active project selected.");
        }
        try {
            LOGGER.info("Received git pull request for project: {}", projectPath);
            String result = gitService.pull(projectPath);
            return ResponseEntity.ok(result);
        } catch (GitAPIException | IOException e) {
            LOGGER.error("Pull failed for project '{}'", projectPath, e);
            return ResponseEntity.internalServerError().body("Pull failed: " + e.getMessage());
        } catch (IllegalStateException e) {
            LOGGER.warn("Bad request on pull for project '{}': {}", projectPath, e.getMessage());
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 在指定项目中执行Git推送。
     *
     * @param projectPath 项目的名称/路径 (可选)。
     * @return 操作结果的ResponseEntity，成功时包含消息和仓库URL。
     */
    @PostMapping("/push")
    public ResponseEntity<?> push(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "No active project selected."));
        }
        try {
            LOGGER.info("Received git push request for project: {}", projectPath);
            Map<String, Object> result = gitService.push(projectPath);
            return ResponseEntity.ok(result);
        } catch (GitAPIException | IOException e) {
            LOGGER.error("Push failed for project '{}'", projectPath, e);
            return ResponseEntity.internalServerError().body(Map.of("message", "Push failed: " + e.getMessage()));
        } catch (IllegalStateException e) {
            LOGGER.warn("Bad request on push for project '{}': {}", projectPath, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}