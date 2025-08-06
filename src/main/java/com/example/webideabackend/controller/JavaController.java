package com.example.webideabackend.controller;

import com.example.webideabackend.exception.EnvironmentConfigurationException;
import com.example.webideabackend.model.AnalysisResult;
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
    // 这个线程池现在只用于 Service 内部，Controller 不再直接使用它提交任务
    // private final ExecutorService taskExecutor = Executors.newSingleThreadExecutor();

    @Autowired
    public JavaController(JavaCompilerRunnerService javaRunnerService, JavaStructureService javaStructureService) {
        this.javaRunnerService = javaRunnerService;
        this.javaStructureService = javaStructureService;
    }

    /**
     * 构建并运行一个项目。
     */
    @PostMapping("/build")
    public ResponseEntity<?> buildAndRunProject(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "No active project selected to build and run."));
        }
        try {
            // ========================= 关键修改 START: 调用新的同步验证方法 =========================
            javaRunnerService.validateIsMavenProject(projectPath);
            // initiateBuildAndRun 是同步的，如果环境有问题，它会立即抛出异常
            javaRunnerService.initiateBuildAndRun(projectPath);
            // 如果没有异常，说明验证通过，异步任务已提交，可以安全返回 200 OK
            return ResponseEntity.ok(Map.of("message", "Build and run process initiated for project: " + projectPath));
            // ========================= 关键修改 END ============================================

        } catch (EnvironmentConfigurationException e) {
            // 这个 catch 块现在可以正确捕获环境配置错误
            return ResponseEntity.badRequest().body(Map.of(
                    "type", "ENVIRONMENT_ERROR",
                    "message", "执行环境未正确配置。",
                    "details", e.getMessage(),
                    "missing", e.getMissingComponent(),
                    "requiredVersion", e.getRequiredVersion() != null ? e.getRequiredVersion() : ""
            ));
        } catch (IllegalArgumentException e) {
            // 捕获非Maven项目的错误
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 获取类名和错误
     */
    @GetMapping("/class-names")
    public ResponseEntity<AnalysisResult> getClassNamesAndErrors(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.ok(new AnalysisResult(Collections.emptyList(), Collections.emptyList()));
        }
        AnalysisResult result = javaStructureService.findClassNamesAndErrorsInProject(projectPath);
        return ResponseEntity.ok(result);
    }

    // 该方法在 DisposableBean 中不再需要，因为 ExecutorService 移到了 Service 层
    @Override
    public void destroy() throws Exception {
        // ExecutorService has been moved to JavaCompilerRunnerService
        // and should be managed there.
    }
}