/**
 * JavaStructureService.java
 *
 * 该服务负责解析Java项目的源代码结构，例如提取所有公共类的完全限定名称以及捕获语法错误。
 * 它使用 JavaParser 库进行静态代码分析。
 * 它依赖 SettingsService 来定位项目文件在工作区中的位置。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.AnalysisResult;
import club.ppmc.idea.model.CompilationResult;
import com.github.javaparser.ParseProblemException;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class JavaStructureService {

    private final SettingsService settingsService;

    public JavaStructureService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    private Path getWorkspaceRoot() {
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();
        return Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    /**
     * 在指定项目中查找所有Java类和接口的完全限定名称，并捕获解析错误。
     *
     * @param projectPath 项目的路径。
     * @return 一个包含类名和错误列表的 AnalysisResult 对象。
     */
    public AnalysisResult findClassNamesAndErrorsInProject(String projectPath) {
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        Path srcDir = projectDir.resolve("src/main/java");

        if (Files.notExists(srcDir)) {
            log.warn("项目 '{}' 中不存在标准的 'src/main/java' 目录。", projectPath);
            return new AnalysisResult(Collections.emptyList(), Collections.emptyList());
        }

        var allClassNames = new ArrayList<String>();
        var allErrors = new ArrayList<CompilationResult>();

        try (Stream<Path> stream = Files.walk(srcDir)) {
            stream
                    .filter(path -> path.toString().endsWith(".java"))
                    .forEach(
                            javaFile -> {
                                AnalysisResult fileResult = parseFile(javaFile, projectDir);
                                allClassNames.addAll(fileResult.classNames());
                                allErrors.addAll(fileResult.errors());
                            });
        } catch (IOException e) {
            log.error("遍历项目 '{}' 的文件树时出错", projectPath, e);
            allErrors.add(new CompilationResult("ERROR", "无法读取项目文件: " + e.getMessage(), projectPath, 1, 1));
        }

        return new AnalysisResult(allClassNames.stream().distinct().toList(), allErrors);
    }

    /**
     * 解析单个Java文件，提取类名和语法错误。
     *
     * @param javaFile 要解析的文件路径。
     * @param projectDir 项目根目录，用于计算相对路径。
     * @return 包含该文件类名和错误的 AnalysisResult。
     */
    private AnalysisResult parseFile(Path javaFile, Path projectDir) {
        try {
            var cu = StaticJavaParser.parse(javaFile);
            List<String> classNames =
                    cu.findAll(ClassOrInterfaceDeclaration.class).stream()
                            .filter(c -> c.isPublic() && c.getFullyQualifiedName().isPresent())
                            .map(c -> c.getFullyQualifiedName().get())
                            .toList();
            return new AnalysisResult(classNames, Collections.emptyList());
        } catch (ParseProblemException e) {
            log.debug("无法解析文件: {}. 原因: {}", javaFile, e.getMessage());
            String relativePath = projectDir.relativize(javaFile).toString().replace("\\", "/");

            List<CompilationResult> errors =
                    e.getProblems().stream()
                            .map(
                                    problem -> {
                                        var location = problem.getLocation();
                                        int line = location.map(loc -> loc.getBegin().getRange().map(r -> r.begin.line).orElse(1)).orElse(1);
                                        int column = location.map(loc -> loc.getBegin().getRange().map(r -> r.begin.column).orElse(1)).orElse(1);
                                        return new CompilationResult("ERROR", problem.getMessage(), relativePath, line, column);
                                    })
                            .toList();
            return new AnalysisResult(Collections.emptyList(), errors);
        } catch (Exception e) {
            log.warn("解析文件 {} 时发生意外错误: {}", javaFile, e.getMessage());
            return new AnalysisResult(Collections.emptyList(), Collections.emptyList());
        }
    }
}