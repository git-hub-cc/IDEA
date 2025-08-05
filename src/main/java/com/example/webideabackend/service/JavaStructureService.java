package com.example.webideabackend.service;

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

    private final Path workspaceRoot;

    public JavaStructureService(@Value("${app.workspace-root}") String workspaceRootPath) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
    }

    /**
     * 在指定项目中查找所有Java类和接口的完全限定名称。
     *
     * @param projectPath 项目的路径。
     * @return 一个包含所有找到的类/接口名的列表。
     */
    public List<String> findClassNamesInProject(String projectPath) {
        Path projectDir = workspaceRoot.resolve(projectPath);
        Path srcDir = projectDir.resolve("src/main/java");

        if (!Files.exists(srcDir)) {
            log.warn("Project '{}' does not have a standard 'src/main/java' directory.", projectPath);
            return Collections.emptyList();
        }

        try (Stream<Path> stream = Files.walk(srcDir)) {
            return stream
                    .filter(path -> path.toString().endsWith(".java"))
                    .flatMap(this::parseFileForClassNames)
                    .distinct()
                    .collect(Collectors.toList());
        } catch (IOException e) {
            log.error("Error walking file tree for project '{}'", projectPath, e);
            return Collections.emptyList();
        }
    }

    /**
     * 解析单个Java文件，提取其中定义的公共类或接口的名称。
     *
     * @param javaFile 要解析的文件路径。
     * @return 包含该文件中所有完全限定类名的Stream。
     */
    private Stream<String> parseFileForClassNames(Path javaFile) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);
            return cu.findAll(ClassOrInterfaceDeclaration.class).stream()
                    .filter(c -> c.isPublic() && c.getFullyQualifiedName().isPresent())
                    .map(c -> c.getFullyQualifiedName().get());
        } catch (Exception e) {
            // 忽略无法解析的文件，这可能是由于语法错误等原因
            log.debug("Could not parse file: {}. Reason: {}", javaFile, e.getMessage());
            return Stream.empty();
        }
    }
}