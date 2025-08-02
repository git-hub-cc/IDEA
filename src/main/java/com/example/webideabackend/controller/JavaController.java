package com.example.webideabackend.controller;

import com.example.webideabackend.model.RunJavaRequest;
import com.example.webideabackend.service.JavaCompilerRunnerService;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
     * JDK版本将由后端根据项目的 pom.xml 自动确定。
     *
     * @param projectPath 要构建和运行的项目。
     * @return 一个表示操作已启动的响应实体。
     */
    @PostMapping("/build")
    public ResponseEntity<String> buildAndRunProject(@RequestParam String projectPath) {
        // 将整个异步任务链委托给服务层
        taskExecutor.submit(() -> javaRunnerService.buildAndRunProject(projectPath));
        return ResponseEntity.ok("Build and run process initiated for project: " + projectPath);
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