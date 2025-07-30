
/**
 * GitController.java
 *
 * 该REST控制器提供了与版本控制(Git)功能相关的API端点。
 * 前端通过这些接口来执行获取状态、提交等操作。
 */
package com.example.webideabackend.controller;

import com.example.webideabackend.model.GitStatusResponse;
import com.example.webideabackend.service.GitService;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/git")
public class GitController {

    private final GitService gitService;

    @Autowired
    public GitController(GitService gitService) {
        this.gitService = gitService;
    }

    @GetMapping("/status")
    public ResponseEntity<?> getStatus() {
        try {
            GitStatusResponse status = gitService.getStatus();
            return ResponseEntity.ok(status);
        } catch (GitAPIException | IOException e) {
            return ResponseEntity.internalServerError().body("Failed to get Git status: " + e.getMessage());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/commit")
    public ResponseEntity<?> commit(@RequestBody Map<String, String> payload) {
        try {
            String message = payload.get("message");
            // 在实际应用中，用户信息应该从安全上下文中获取
            String authorName = payload.getOrDefault("authorName", "WebApp User");
            String authorEmail = payload.getOrDefault("authorEmail", "user@example.com");

            if (message == null || message.isBlank()) {
                return ResponseEntity.badRequest().body("Commit message cannot be empty.");
            }
            gitService.commit(message, authorName, authorEmail);
            return ResponseEntity.ok("Commit successful.");
        } catch (GitAPIException e) {
            return ResponseEntity.internalServerError().body("Failed to commit: " + e.getMessage());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/pull")
    public ResponseEntity<?> pull() {
        try {
            String result = gitService.pull();
            return ResponseEntity.ok(result);
        } catch (GitAPIException e) {
            return ResponseEntity.internalServerError().body("Pull failed: " + e.getMessage());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/push")
    public ResponseEntity<?> push() {
        try {
            String result = gitService.push();
            return ResponseEntity.ok(result);
        } catch (GitAPIException e) {
            // JGit的PushCommand在认证失败时会抛出TransportException，它是GitAPIException的子类
            return ResponseEntity.internalServerError().body("Push failed: " + e.getMessage());
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}