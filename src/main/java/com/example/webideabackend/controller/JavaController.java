package com.example.webideabackend.controller;

import com.example.webideabackend.model.AnalysisResult;
// import com.example.webideabackend.model.RunJavaRequest; // 不再需要
import com.example.webideabackend.service.JavaCompilerRunnerService;
import com.example.webideabackend.service.JavaStructureService;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/java")
public class JavaController implements DisposableBean {

    private final JavaCompilerRunnerService javaRunnerService;
    private final JavaStructureService javaStructureService;
    // 这个线程池现在只用于 buildAndRunProject 的异步启动
    private final ExecutorService taskExecutor = Executors.newSingleThreadExecutor();

    @Autowired
    public JavaController(JavaCompilerRunnerService javaRunnerService, JavaStructureService javaStructureService) {
        this.javaRunnerService = javaRunnerService;
        this.javaStructureService = javaStructureService;
    }

    /**
     * 构建并运行一个项目。
     * (方法逻辑保持不变)
     */
    @PostMapping("/build")
    public ResponseEntity<?> buildAndRunProject(@RequestParam(required = false) String projectPath) {
        // ... 方法体保持不变 ...
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "No active project selected to build and run."));
        }
        try {
            javaRunnerService.validateIsMavenProject(projectPath);

            // 异步执行构建和运行
            taskExecutor.submit(() -> javaRunnerService.buildAndRunProject(projectPath));
            return ResponseEntity.ok(Map.of("message", "Build and run process initiated for project: " + projectPath));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 获取类名和错误
     * (方法逻辑保持不变)
     */
    @GetMapping("/class-names")
    public ResponseEntity<AnalysisResult> getClassNamesAndErrors(@RequestParam(required = false) String projectPath) {
        // ... 方法体保持不变 ...
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.ok(new AnalysisResult(Collections.emptyList(), Collections.emptyList()));
        }
        AnalysisResult result = javaStructureService.findClassNamesAndErrorsInProject(projectPath);
        return ResponseEntity.ok(result);
    }

    // `runJava` 端点可以被移除或注释掉，因为它已被 `buildAndRunProject` 的流程所取代
    /*
    @PostMapping("/run")
    public ResponseEntity<String> runJava(@RequestBody RunJavaRequest request) {
        javaRunnerService.runJavaApplication(request.projectPath(), request.mainClass(), null);
        return ResponseEntity.ok("Java application run initiated.");
    }
    */

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