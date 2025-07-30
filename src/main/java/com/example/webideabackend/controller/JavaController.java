// src/main/java/com/example/webideabackend/controller/JavaController.java

package com.example.webideabackend.controller;

import com.example.webideabackend.model.RunJavaRequest;
import com.example.webideabackend.service.JavaCompilerRunnerService;
import com.example.webideabackend.service.WebSocketLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/java")
public class JavaController {

    private final JavaCompilerRunnerService javaRunnerService;
    private final WebSocketLogService logService;
    // --- 新增：从配置文件或硬编码中获取主类 ---
    private final String MAIN_CLASS = "com.example.Main";

    @Autowired
    public JavaController(JavaCompilerRunnerService javaRunnerService, WebSocketLogService logService) {
        this.javaRunnerService = javaRunnerService;
        this.logService = logService;
    }

    @PostMapping("/build")
    public ResponseEntity<String> buildAndRunProject(@RequestParam String projectPath) {
        logService.sendMessage("/topic/build-log", "Build command received for: " + projectPath);

        CompletableFuture<Integer> buildFuture = javaRunnerService.runMavenBuild(projectPath, "mvnw clean install -U -Dfile.encoding=UTF-8");

        buildFuture.whenComplete((exitCode, throwable) -> {
            if (throwable != null) {
                logService.sendMessage("/topic/build-log", "Build failed with exception: " + throwable.getMessage());
                return;
            }

            logService.sendMessage("/topic/build-log", "Build finished with exit code: " + exitCode);

            // --- 关键逻辑：如果构建成功，则自动运行 ---
            if (exitCode == 0) {
                logService.sendMessage("/topic/run-log", "Build successful. Initiating run for main class: " + MAIN_CLASS);
                CompletableFuture<Integer> runFuture = javaRunnerService.runJavaApplication(projectPath, MAIN_CLASS);

                runFuture.whenComplete((runExitCode, runThrowable) -> {
                    if (runThrowable != null) {
                        logService.sendMessage("/topic/run-log", "Application run failed with exception: " + runThrowable.getMessage());
                    } else {
                        logService.sendMessage("/topic/run-log", "Application finished with exit code: " + runExitCode);
                    }
                });
            } else {
                logService.sendMessage("/topic/run-log", "Build failed. Skipping run.");
            }
        });

        return ResponseEntity.ok("Build and run process initiated for project: " + projectPath);
    }

    // 保留/run端点，以便将来可以单独运行而不构建
    @PostMapping("/run")
    public ResponseEntity<String> runJava(@RequestBody RunJavaRequest request) {
        logService.sendMessage("/topic/run-log", "Run command received for: " + request.getMainClass() + " in project: " + request.getProjectPath());
        CompletableFuture<Integer> future = javaRunnerService.runJavaApplication(request.getProjectPath(), request.getMainClass());

        future.whenComplete((exitCode, throwable) -> {
            if (throwable != null) {
                logService.sendMessage("/topic/run-log", "Application run failed with exception: " .concat(throwable.getMessage()));
            } else {
                logService.sendMessage("/topic/run-log", "Application finished with exit code: " + exitCode);
            }
        });
        return ResponseEntity.ok("Java application run initiated.");
    }
}