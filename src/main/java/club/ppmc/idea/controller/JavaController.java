/**
 * JavaController.java
 *
 * 该控制器负责处理与Java项目编译、运行和结构分析相关的HTTP请求。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.exception.EnvironmentConfigurationException;
import club.ppmc.idea.model.AnalysisResult;
import club.ppmc.idea.service.JavaCompilerRunnerService;
import club.ppmc.idea.service.JavaStructureService;
import java.util.Collections;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/java")
public class JavaController {

    private final JavaCompilerRunnerService javaRunnerService;
    private final JavaStructureService javaStructureService;

    public JavaController(
            JavaCompilerRunnerService javaRunnerService, JavaStructureService javaStructureService) {
        this.javaRunnerService = javaRunnerService;
        this.javaStructureService = javaStructureService;
    }

    /**
     * 构建并运行一个Java项目。
     */
    @PostMapping("/build")
    public ResponseEntity<?> buildAndRunProject(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "未选择要构建和运行的活动项目。"));
        }
        try {
            // initiateBuildAndRun现在会进行同步验证，如果环境有问题会立即抛出异常
            javaRunnerService.initiateBuildAndRun(projectPath);
            return ResponseEntity.ok(Map.of("message", "已为项目 " + projectPath + " 发起构建和运行流程。"));
        } catch (EnvironmentConfigurationException e) {
            // 捕获特定的环境配置错误，并返回结构化的错误信息给前端
            return ResponseEntity.badRequest().body(e.toErrorData());
        } catch (IllegalArgumentException e) {
            // 捕获其他验证错误，如非Maven项目
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 获取指定项目中的所有公共类名及解析错误。
     */
    @GetMapping("/class-names")
    public ResponseEntity<AnalysisResult> getClassNamesAndErrors(
            @RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.ok(new AnalysisResult(Collections.emptyList(), Collections.emptyList()));
        }
        return ResponseEntity.ok(javaStructureService.findClassNamesAndErrorsInProject(projectPath));
    }
}