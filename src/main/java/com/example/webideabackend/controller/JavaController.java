/**
 * 文件头注释：
 * JavaController.java
 * 该文件是一个RESTful控制器，负责处理Java项目的构建和运行请求。
 * 它协调 JavaCompilerRunnerService (执行实际的编译和运行) 和 WebSocketLogService (发送实时日志)。
 * 它使用了CompletableFuture来处理长时间运行的异步任务，并将结果流式传输到客户端。
 */
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
public class JavaController implements DisposableBean { // 实现DisposableBean以管理线程池

    private static final String MAIN_CLASS = "com.example.Main"; // 默认主类
    private static final String BUILD_LOG_TOPIC = "/topic/build-log";
    private static final String RUN_LOG_TOPIC = "/topic/run-log";

    private final JavaCompilerRunnerService javaRunnerService;
    private final WebSocketLogService logService;

    /*
     * 设计决策修正：
     * 原先使用的 Executors.newVirtualThreadPerTaskExecutor() 是 Java 19+ 的API，与项目配置的Java 17不兼容。
     * 现修正为 Executors.newCachedThreadPool()。这是一个在Java 17中完全可用的标准线程池，
     * 它会根据需要创建和复用线程来处理异步任务，非常适合我们这种I/O密集型的操作，
     * 能够有效地将耗时任务从HTTP请求线程中解耦。
     */
    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();

    @Autowired
    public JavaController(JavaCompilerRunnerService javaRunnerService, WebSocketLogService logService) {
        this.javaRunnerService = javaRunnerService;
        this.logService = logService;
    }

    @PostMapping("/build")
    public ResponseEntity<String> buildAndRunProject(@RequestParam String projectPath) {
        logService.sendMessage(BUILD_LOG_TOPIC, "Build command received for: " + projectPath);

        /*
         * 复杂逻辑注释：
         * 这是一个全异步的构建和运行流程，旨在提供非阻塞的实时反馈。
         * 1. `runMavenBuild` 返回一个 CompletableFuture<Integer>，代表Maven构建过程。
         * 2. 使用 `thenAcceptAsync` 注册一个回调，该回调在构建完成后在我们的自定义`taskExecutor`线程池中执行。
         *    这避免了阻塞当前HTTP请求线程，也避免了在默认的ForkJoinPool中执行潜在的阻塞I/O。
         * 3. 在回调中，检查构建的退出码 (exitCode)。
         *    - 如果为0（成功），则触发 `runJavaApplication`，开始运行程序。
         *    - 如果非0（失败），则发送失败日志，流程终止。
         * 4. 整个链条上的异常都由 `exceptionally` 捕获。
         */
        javaRunnerService.runMavenBuild(projectPath)
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
            javaRunnerService.runJavaApplication(projectPath, MAIN_CLASS)
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

        javaRunnerService.runJavaApplication(request.projectPath(), request.mainClass())
                .thenAcceptAsync(exitCode ->
                        logService.sendMessage(RUN_LOG_TOPIC, "Application finished with exit code: " + exitCode), taskExecutor)
                .exceptionally(ex -> {
                    logService.sendMessage(RUN_LOG_TOPIC, "Application run failed with exception: " + ex.getMessage());
                    return null;
                });

        return ResponseEntity.ok("Java application run initiated.");
    }

    /**
     * 实现 DisposableBean 接口的 destroy 方法。
     * 此方法由Spring容器在销毁bean（例如，应用关闭时）时自动调用。
     * 我们必须在这里优雅地关闭我们创建的线程池，以防止资源泄露。
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