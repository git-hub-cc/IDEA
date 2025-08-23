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
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
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
                                AnalysisResult fileResult = parseFileForClassesAndErrors(javaFile, projectDir);
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
     * 在指定项目中查找所有包含 `main` 方法的公共类。
     *
     * @param projectPath 项目路径。
     * @return 包含所有可执行主类的完全限定名称的列表。
     */
    public List<String> findMainClassesInProject(String projectPath) {
        Path projectDir = getWorkspaceRoot().resolve(projectPath);
        Path srcDir = projectDir.resolve("src/main/java");
        if (Files.notExists(srcDir)) {
            return Collections.emptyList();
        }

        var mainClasses = new ArrayList<String>();
        try (Stream<Path> stream = Files.walk(srcDir)) {
            stream
                    .filter(path -> path.toString().endsWith(".java"))
                    .forEach(javaFile -> {
                        try {
                            var cu = StaticJavaParser.parse(javaFile);
                            // ========================= 关键修改 START =========================
                            // 采用更稳健的逻辑：先找到所有类，再检查它们是否包含main方法。
                            cu.findAll(ClassOrInterfaceDeclaration.class).stream()
                                    // 过滤出那些包含至少一个有效main方法的类
                                    .filter(cd -> cd.getMethodsByName("main").stream().anyMatch(this::isMainMethod))
                                    // 确保该类有完全限定名（例如，不是方法内部的局部类）
                                    .filter(cd -> cd.getFullyQualifiedName().isPresent())
                                    // 提取完全限定名
                                    .map(cd -> cd.getFullyQualifiedName().get())
                                    // 将找到的类名添加到列表中
                                    .forEach(mainClasses::add);
                            // ========================= 关键修改 END ===========================
                        } catch (Exception e) {
                            // 忽略解析失败的文件
                            log.debug("解析文件 {} 以查找main方法时失败: {}", javaFile, e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.error("遍历项目 '{}' 以查找主类时出错", projectPath, e);
        }
        return mainClasses.stream().distinct().toList();
    }


    /**
     * 检查一个方法声明是否是 `public static void main(String[] args)`。
     */
    private boolean isMainMethod(MethodDeclaration md) {
        // 1. 检查修饰符: public 和 static
        if (!md.getModifiers().contains(Modifier.publicModifier()) || !md.getModifiers().contains(Modifier.staticModifier())) {
            return false;
        }
        // 2. 检查返回类型: void
        if (!md.getType().isVoidType()) {
            return false;
        }
        // 3. 检查方法名: main
        if (!md.getNameAsString().equals("main")) {
            return false;
        }
        // 4. 检查参数: 必须有且仅有一个参数
        if (md.getParameters().size() != 1) {
            return false;
        }
        // 5. 检查参数类型: String[] 或 String...
        Parameter param = md.getParameter(0);
        return param.getType().asString().equals("String[]") ||
                (param.isVarArgs() && param.getType().getElementType().asString().equals("String"));
    }

    /**
     * 解析单个Java文件，提取类名和语法错误。
     *
     * @param javaFile 要解析的文件路径。
     * @param projectDir 项目根目录，用于计算相对路径。
     * @return 包含该文件类名和错误的 AnalysisResult。
     */
    private AnalysisResult parseFileForClassesAndErrors(Path javaFile, Path projectDir) {
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