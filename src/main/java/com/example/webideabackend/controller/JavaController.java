package com.example.webideabackend.controller;

import com.example.webideabackend.model.RunJavaRequest;
import com.example.webideabackend.service.JavaCompilerRunnerService;
import com.example.webideabackend.service.WebSocketLogService;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/java")
public class JavaController implements DisposableBean {

    private static final String MAIN_CLASS = "com.example.Main";
    private static final String BUILD_LOG_TOPIC = "/topic/build-log";
    private static final String RUN_LOG_TOPIC = "/topic/run-log";

    private final JavaCompilerRunnerService javaRunnerService;
    private final WebSocketLogService logService;
    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();

    @Autowired
    public JavaController(JavaCompilerRunnerService javaRunnerService, WebSocketLogService logService) {
        this.javaRunnerService = javaRunnerService;
        this.logService = logService;
    }

    @PostMapping("/build")
    public ResponseEntity<String> buildAndRunProject(@RequestParam String projectPath) {
        logService.sendMessage(BUILD_LOG_TOPIC, "Build command received for: " + projectPath);

        javaRunnerService.runMavenBuild(projectPath) // 关键修改
                .thenAcceptAsync(exitCode -> handleBuildResult(exitCode, projectPath), taskExecutor)
                .exceptionally(ex -> {
                    logService.sendMessage(BUILD_LOG_TOPIC, "Build failed with exception: " + ex.getMessage());
                    return null;
                });

        return ResponseEntity.ok("Build and run process initiated for project: " + projectPath);
    }

    private void handleBuildResult(int exitCode, String projectPath) {
        logService.sendMessage(BUILD_LOG_TOPIC, "Build finished with exit code: " + exitCode);
        if (exitCode == 0) {
            logService.sendMessage(RUN_LOG_TOPIC, "Build successful. Initiating run for main class: " + MAIN_CLASS);
            javaRunnerService.runJavaApplication(projectPath, MAIN_CLASS) // 关键修改
                    .thenAcceptAsync(runExitCode ->
                            logService.sendMessage(RUN_LOG_TOPIC, "Application finished with exit code: " + runExitCode), taskExecutor)
                    .exceptionally(ex -> {
                        logService.sendMessage(RUN_LOG_TOPIC, "Application run failed with exception: " + ex.getMessage());
                        return null;
                    });
        } else {
            logService.sendMessage(RUN_LOG_TOPIC, "Build failed. Skipping run.");
        }
    }

    @PostMapping("/run")
    public ResponseEntity<String> runJava(@RequestBody RunJavaRequest request) {
        logService.sendMessage(RUN_LOG_TOPIC, "Run command received for: " + request.mainClass() + " in project: " + request.projectPath());

        javaRunnerService.runJavaApplication(request.projectPath(), request.mainClass()) // 关键修改
                .thenAcceptAsync(exitCode ->
                        logService.sendMessage(RUN_LOG_TOPIC, "Application finished with exit code: " + exitCode), taskExecutor)
                .exceptionally(ex -> {
                    logService.sendMessage(RUN_LOG_TOPIC, "Application run failed with exception: " + ex.getMessage());
                    return null;
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