package com.example.webideabackend.controller;

import com.example.webideabackend.model.RunJavaRequest;
import com.example.webideabackend.service.JavaCompilerRunnerService;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/java")
public class JavaController implements DisposableBean {

    private final JavaCompilerRunnerService javaRunnerService;
    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();

    @Autowired
    public JavaController(JavaCompilerRunnerService javaRunnerService) {
        this.javaRunnerService = javaRunnerService;
    }

    // ========================= 关键修改 START =========================
    /**
     * 构建并运行一个项目。
     * 在启动异步构建过程之前，会首先同步验证该项目是否为有效的Maven项目。
     *
     * @param projectPath 要构建和运行的项目。
     * @return 如果验证通过，返回一个表示操作已启动的响应；如果验证失败，返回一个Bad Request响应。
     */
    @PostMapping("/build")
    public ResponseEntity<?> buildAndRunProject(@RequestParam String projectPath) {
        try {
            // 1. 同步验证项目结构
            javaRunnerService.validateIsMavenProject(projectPath);

            // 2. 验证通过，异步执行构建和运行
            taskExecutor.submit(() -> javaRunnerService.buildAndRunProject(projectPath));
            return ResponseEntity.ok(Map.of("message", "Build and run process initiated for project: " + projectPath));

        } catch (IllegalArgumentException e) {
            // 3. 验证失败，返回一个带有清晰错误信息的 400 Bad Request
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
    // ========================= 关键修改 END ===========================

    @PostMapping("/run")
    public ResponseEntity<String> runJava(@RequestBody RunJavaRequest request) {
        // 注意：这个独立的 /run 端点目前不支持POM的JDK检测，它主要用于特殊场景。
        // UI上的主要“运行”按钮使用的是 /build 端点。
        javaRunnerService.runJavaApplication(request.projectPath(), request.mainClass(), null)
                .exceptionally(ex -> {
                    System.err.println("Application run failed with exception: " + ex.getMessage());
                    return -1;
                });

        return ResponseEntity.ok("Java application run initiated.");
    }

    @Override
    public void destroy() throws Exception {
        taskExecutor.shutdown();
        try {
            if (!taskExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                taskExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            taskExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}