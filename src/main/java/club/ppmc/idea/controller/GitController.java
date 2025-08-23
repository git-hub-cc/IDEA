/**
 * GitController.java
 *
 * 该控制器处理所有与Git相关的HTTP请求。
 * 它将前端的Git操作（如查看状态、克隆、提交、推送、拉取）路由到 GitService 进行处理。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.model.GitCredentialsRequest;
import club.ppmc.idea.model.GitStatusResponse;
import club.ppmc.idea.model.RemoteRepoInfo;
import club.ppmc.idea.service.GitService;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/git")
@Slf4j
public class GitController {

    private final GitService gitService;

    public GitController(GitService gitService) {
        this.gitService = gitService;
    }

    /**
     * 根据用户提供的平台和Token，获取其公开仓库列表。
     */
    @GetMapping("/remote-repos")
    public ResponseEntity<List<RemoteRepoInfo>> getRemoteRepos(
            @RequestParam String platform,
            @RequestHeader("Authorization") String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        return ResponseEntity.ok(gitService.getRemoteRepositories(platform, token));
    }

    /**
     * 克隆一个指定的远程仓库到工作区。
     */
    @PostMapping("/clone-specific")
    public ResponseEntity<?> cloneSpecificRepository(@RequestBody Map<String, String> payload) {
        String repoCloneUrl = payload.get("cloneUrl");
        String token = payload.get("token"); // 从请求体获取token

        if (repoCloneUrl == null || repoCloneUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "克隆地址 (cloneUrl) 不能为空。"));
        }
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "访问令牌 (token) 不能为空。"));
        }
        try {
            String projectName = gitService.cloneSpecificRepository(repoCloneUrl, token);
            return ResponseEntity.ok(Map.of("projectName", projectName));
        } catch (GitAPIException | IOException | IllegalArgumentException e) {
            log.error("克隆仓库 {} 失败", repoCloneUrl, e);
            return ResponseEntity.internalServerError().body(Map.of("message", "克隆仓库失败: " + e.getMessage()));
        }
    }

    /**
     * 获取指定项目的Git状态。
     */
    @GetMapping("/status")
    public ResponseEntity<?> getStatus(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            // 如果没有活动项目，返回一个表示“不适用”的默认状态，避免前端出错
            var noProjectStatus = GitStatusResponse.builder()
                    .currentBranch("N/A")
                    .isClean(true)
                    .added(Collections.emptySet()).modified(Collections.emptySet())
                    .deleted(Collections.emptySet()).untracked(Collections.emptySet())
                    .conflicting(Collections.emptySet()).build();
            return ResponseEntity.ok(noProjectStatus);
        }
        try {
            return ResponseEntity.ok(gitService.getStatus(projectPath));
        } catch (GitAPIException | IOException e) {
            log.error("获取项目 '{}' 的Git状态失败", projectPath, e);
            return ResponseEntity.internalServerError().body(Map.of("message", "获取Git状态失败: " + e.getMessage()));
        }
    }

    /**
     * 在指定项目中执行Git提交。
     */
    @PostMapping("/commit")
    public ResponseEntity<Map<String, String>> commit(@RequestBody Map<String, String> payload) {
        String projectPath = payload.get("projectPath");
        String message = payload.get("message");
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "项目路径不能为空。"));
        }
        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "提交信息不能为空。"));
        }
        try {
            String authorName = payload.getOrDefault("authorName", "WebApp User");
            String authorEmail = payload.getOrDefault("authorEmail", "user@example.com");
            gitService.commit(projectPath, message, authorName, authorEmail);
            return ResponseEntity.ok(Map.of("message", "提交成功。"));
        } catch (GitAPIException | IOException | IllegalStateException e) {
            log.error("为项目 '{}' 提交失败", projectPath, e);
            return ResponseEntity.badRequest().body(Map.of("message", "提交失败: " + e.getMessage()));
        }
    }

    /**
     * 在指定项目中执行Git拉取。
     */
    @PostMapping("/pull")
    public ResponseEntity<Map<String, String>> pull(
            @RequestParam(required = false) String projectPath,
            @RequestBody GitCredentialsRequest credentials) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "未选择活动项目。"));
        }
        try {
            log.info("收到项目 '{}' 的git pull请求", projectPath);
            String result = gitService.pull(projectPath, credentials);
            return ResponseEntity.ok(Map.of("message", result));
        } catch (GitAPIException | IOException | IllegalStateException e) {
            log.error("为项目 '{}' 拉取失败", projectPath, e);
            return ResponseEntity.badRequest().body(Map.of("message", "拉取失败: " + e.getMessage()));
        }
    }

    /**
     * 在指定项目中执行Git推送。
     */
    @PostMapping("/push")
    public ResponseEntity<?> push(
            @RequestParam(required = false) String projectPath,
            @RequestBody GitCredentialsRequest credentials) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "未选择活动项目。"));
        }
        try {
            log.info("收到项目 '{}' 的git push请求", projectPath);
            Map<String, Object> result = gitService.push(projectPath, credentials);
            return ResponseEntity.ok(result);
        } catch (GitAPIException | IOException | IllegalStateException e) {
            log.error("为项目 '{}' 推送失败", projectPath, e);
            return ResponseEntity.badRequest().body(Map.of("message", "推送失败: " + e.getMessage()));
        }
    }

    /**
     * 从 "Bearer <token>" 格式的 Authorization 头中提取令牌。
     */
    private String extractToken(String authorizationHeader) {
        if (authorizationHeader != null && authorizationHeader.startsWith("Bearer ")) {
            return authorizationHeader.substring(7);
        }
        return null;
    }
}