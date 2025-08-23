/**
 * JavaController.java
 *
 * 该控制器负责处理与Java项目编译、运行和结构分析相关的HTTP请求。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.exception.EnvironmentConfigurationException;
import club.ppmc.idea.model.AnalysisResult;
import club.ppmc.idea.service.JavaCompilerRunnerService;
import club.ppmc.idea.service.JavaFormattingService;
import club.ppmc.idea.service.JavaStructureService;
import com.google.googlejavaformat.java.FormatterException;
import java.io.IOException; // <-- 新增导入
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/java")
public class JavaController {

    private final JavaCompilerRunnerService javaRunnerService;
    private final JavaStructureService javaStructureService;
    private final JavaFormattingService javaFormattingService;

    public JavaController(
            JavaCompilerRunnerService javaRunnerService,
            JavaStructureService javaStructureService,
            JavaFormattingService javaFormattingService) {
        this.javaRunnerService = javaRunnerService;
        this.javaStructureService = javaStructureService;
        this.javaFormattingService = javaFormattingService;
    }

    /**
     * 构建并运行一个Java项目。
     * ========================= 关键修改 START =========================
     * 此端点现在需要一个 `mainClass` 参数来指定要运行的主类。
     * ========================= 关键修改 END ===========================
     */
    @PostMapping("/build")
    public ResponseEntity<?> buildAndRunProject(
            @RequestParam(required = false) String projectPath,
            @RequestParam(required = false) String mainClass) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "未选择要构建和运行的活动项目。"));
        }
        if (mainClass == null || mainClass.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "必须指定要运行的主类 (mainClass)。"));
        }
        try {
            // initiateBuildAndRun现在会进行同步验证，如果环境有问题会立即抛出异常
            javaRunnerService.initiateBuildAndRun(projectPath, mainClass);
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

    /**
     * ========================= 新增方法 START =========================
     * 扫描指定项目，找出所有包含 public static void main(String[] args) 方法的类。
     *
     * @param projectPath 要扫描的项目路径。
     * @return 包含所有可执行主类完全限定名称的列表。
     * ========================= 新增方法 END ===========================
     */
    @GetMapping("/main-classes")
    public ResponseEntity<List<String>> getMainClasses(@RequestParam(required = false) String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        return ResponseEntity.ok(javaStructureService.findMainClassesInProject(projectPath));
    }

    // ========================= 新增格式化端点 START =========================
    /**
     * 格式化一段Java源代码。
     * @param payload 包含 "code" 键的请求体，其值为要格式化的源代码。
     * @return 包含格式化后代码的响应，或在代码有语法错误时返回错误信息。
     */
    @PostMapping("/format")
    public ResponseEntity<?> formatJavaCode(@RequestBody Map<String, String> payload) {
        String code = payload.get("code");
        if (code == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "请求体中必须包含 'code' 字段。"));
        }
        try {
            String formattedCode = javaFormattingService.formatSource(code);
            return ResponseEntity.ok(Map.of("formattedCode", formattedCode));
        } catch (FormatterException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "代码格式化失败，可能存在语法错误: " + e.getMessage()));
        } catch (IOException | InterruptedException e) {
            // ========================= 关键修改 START =========================
            // 捕获子进程执行可能抛出的其他异常
            Thread.currentThread().interrupt();
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "执行格式化工具时发生内部错误: " + e.getMessage()));
            // ========================= 关键修改 END ===========================
        }
    }
    // ========================= 新增格式化端点 END ===========================
}