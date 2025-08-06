package com.example.webideabackend.service;

import com.example.webideabackend.model.AnalysisResult;
import com.example.webideabackend.model.CompilationResult;
import com.github.javaparser.ParseProblemException;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 负责解析Java项目结构，例如提取所有类名。
 */
@Service
@Slf4j
public class JavaStructureService {

    private final SettingsService settingsService;

    // ========================= 关键修改 START: 移除 @Value 注入 =========================
    public JavaStructureService(SettingsService settingsService) {
        // 移除了 @Value("${app.workspace-root}") String workspaceRootPath 参数
        this.settingsService = settingsService;
    }

    /**
     * 动态获取最新的工作区根目录。
     * @return 当前配置的工作区根目录的 Path 对象。
     */
    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        if (workspaceRootPath == null || workspaceRootPath.isBlank()) {
            workspaceRootPath = "./workspace"; // 安全回退
        }
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }
    // ========================= 关键修改 END ============================================

    /**
     * 在指定项目中查找所有Java类和接口的完全限定名称，并捕获语法错误。
     *
     * @param projectPath 项目的路径。
     * @return 一个包含类名和错误列表的 AnalysisResult 对象。
     */
    public AnalysisResult findClassNamesAndErrorsInProject(String projectPath) {
        // 使用动态路径获取
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        Path srcDir = projectDir.resolve("src/main/java");

        if (!Files.exists(srcDir)) {
            log.warn("Project '{}' does not have a standard 'src/main/java' directory.", projectPath);
            return new AnalysisResult(Collections.emptyList(), Collections.emptyList());
        }

        List<String> allClassNames = new ArrayList<>();
        List<CompilationResult> allErrors = new ArrayList<>();

        try (Stream<Path> stream = Files.walk(srcDir)) {
            stream
                    .filter(path -> path.toString().endsWith(".java"))
                    .forEach(javaFile -> {
                        AnalysisResult fileResult = parseFile(javaFile);
                        allClassNames.addAll(fileResult.classNames());
                        allErrors.addAll(fileResult.errors());
                    });
        } catch (IOException e) {
            log.error("Error walking file tree for project '{}'", projectPath, e);
            allErrors.add(new CompilationResult("ERROR", "无法读取项目文件: " + e.getMessage(), projectPath, 1, 1));
        }

        return new AnalysisResult(allClassNames.stream().distinct().collect(Collectors.toList()), allErrors);
    }

    /**
     * 解析单个Java文件，提取类名和语法错误。
     *
     * @param javaFile 要解析的文件路径。
     * @return 包含该文件类名和错误的 AnalysisResult。
     */
    private AnalysisResult parseFile(Path javaFile) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);
            List<String> classNames = cu.findAll(ClassOrInterfaceDeclaration.class).stream()
                    .filter(c -> c.isPublic() && c.getFullyQualifiedName().isPresent())
                    .map(c -> c.getFullyQualifiedName().get())
                    .collect(Collectors.toList());
            return new AnalysisResult(classNames, Collections.emptyList());
        } catch (ParseProblemException e) {
            log.debug("Could not parse file: {}. Reason: {}", javaFile, e.getMessage());
            // 使用动态路径获取
            Path relativePath = getWorkspaceRoot().relativize(javaFile);
            String projectRelativePath = relativePath.toString().replace("\\", "/");

            List<CompilationResult> errors = e.getProblems().stream()
                    .map(problem -> {
                        int line = problem.getLocation()
                                .map(tokenRange -> tokenRange.getBegin().getRange().map(r -> r.begin.line).orElse(1))
                                .orElse(1);
                        int column = problem.getLocation()
                                .map(tokenRange -> tokenRange.getBegin().getRange().map(r -> r.begin.column).orElse(1))
                                .orElse(1);
                        return new CompilationResult("ERROR", problem.getMessage(), projectRelativePath, line, column);
                    })
                    .collect(Collectors.toList());
            return new AnalysisResult(Collections.emptyList(), errors);
        } catch (Exception e) {
            log.warn("An unexpected error occurred while parsing {}: {}", javaFile, e.getMessage());
            return new AnalysisResult(Collections.emptyList(), Collections.emptyList());
        }
    }
}