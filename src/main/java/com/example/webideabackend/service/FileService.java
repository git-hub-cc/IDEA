// service/FileService.java

package com.example.webideabackend.service;

import com.example.webideabackend.model.FileNode;
import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class FileService {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileService.class);

    private final Path workspaceRoot;

    public FileService(@Value("${app.workspace-root}") String workspaceRootPath) {
        this.workspaceRoot = Paths.get(workspaceRootPath).toAbsolutePath().normalize();
        try {
            if (Files.notExists(this.workspaceRoot)) {
                Files.createDirectories(this.workspaceRoot);
                LOGGER.info("Created workspace root directory: {}", this.workspaceRoot);
            }
            LOGGER.info("Web IDE Workspace Root: {}", this.workspaceRoot);
        } catch (IOException e) {
            LOGGER.error("Failed to create or access workspace root directory: {}", this.workspaceRoot, e);
            throw new IllegalStateException("Workspace root setup failed", e);
        }
    }

    public List<String> getProjectList() throws IOException {
        try (Stream<Path> stream = Files.list(workspaceRoot)) {
            return stream
                    .filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> !name.startsWith(".")) // Exclude hidden directories like .ide
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .collect(Collectors.toList());
        }
    }

    public FileNode getFileTree(String projectPath, String relativePathInProject) throws IOException {
        var absPath = getAbsoluteProjectPath(projectPath, relativePathInProject);
        if (Files.notExists(absPath)) {
            throw new IOException("Path not found: " + absPath);
        }
        return buildFileNode(projectPath, absPath);
    }

    private FileNode buildFileNode(String projectPath, Path path) throws IOException {
        var file = path.toFile();
        var node = new FileNode();

        node.setName(file.getName());
        node.setPath(getRelativePathInProject(projectPath, path));
        node.setType(file.isDirectory() ? "folder" : "file");
        node.setSize(file.length());
        node.setLastModified(file.lastModified());

        if (file.isDirectory()) {
            try (Stream<Path> stream = Files.list(path)) {
                List<FileNode> children = stream
                        .filter(p -> !p.getFileName().toString().startsWith("."))
                        .map(p -> {
                            try {
                                return buildFileNode(projectPath, p);
                            } catch (IOException e) {
                                throw new RuntimeException(e);
                            }
                        })
                        .sorted(Comparator
                                .comparing((FileNode n) -> "folder".equals(n.getType()) ? 0 : 1)
                                .thenComparing(FileNode::getName, String.CASE_INSENSITIVE_ORDER))
                        .collect(Collectors.toList());
                node.setChildren(children);
            }
        }
        return node;
    }

    // ========================= 关键修改 START =========================
    /**
     * 读取文件内容为字节数组。
     * 这使得该方法既能处理文本文件，也能处理二进制文件。
     *
     * @param projectPath 项目路径
     * @param relativePathInProject 文件在项目中的相对路径
     * @return 文件的字节数组
     * @throws IOException 如果读取文件失败
     */
    public byte[] readFileContent(String projectPath, String relativePathInProject) throws IOException {
        var absPath = getAbsoluteProjectPath(projectPath, relativePathInProject);
        if (Files.isDirectory(absPath)) {
            throw new IOException("Cannot read content of a directory: " + absPath);
        }
        return Files.readAllBytes(absPath);
    }
    // ========================= 关键修改 END ===========================


    public void writeFileContent(String projectPath, String relativePathInProject, String content) throws IOException {
        var absPath = getAbsoluteProjectPath(projectPath, relativePathInProject);
        Files.createDirectories(absPath.getParent());
        Files.writeString(absPath, content);
    }

    public void createFile(String projectPath, String parentRelativePath, String name, String type) throws IOException {
        var parentAbsPath = getAbsoluteProjectPath(projectPath, parentRelativePath);
        var newPath = parentAbsPath.resolve(name);

        if (Files.exists(newPath)) {
            throw new IOException("File or directory already exists: " + newPath);
        }

        switch (type.toLowerCase()) {
            case "file" -> Files.createFile(newPath);
            case "directory", "folder" -> Files.createDirectory(newPath);
            default -> throw new IllegalArgumentException("Invalid type specified: " + type);
        }
    }

    public void deleteFile(String projectPath, String relativePathInProject) throws IOException {
        var absPath = getAbsoluteProjectPath(projectPath, relativePathInProject);
        if (Files.isDirectory(absPath)) {
            FileUtils.deleteDirectory(absPath.toFile());
        } else {
            Files.delete(absPath);
        }
    }

    public void renameFile(String projectPath, String oldRelativePath, String newName) throws IOException {
        var oldAbsPath = getAbsoluteProjectPath(projectPath, oldRelativePath);
        if (Files.notExists(oldAbsPath)) {
            throw new IOException("Source path not found: " + oldAbsPath);
        }
        var newAbsPath = oldAbsPath.resolveSibling(newName);
        if (Files.exists(newAbsPath)) {
            throw new IOException("Target path already exists: " + newAbsPath);
        }
        Files.move(oldAbsPath, newAbsPath);
    }

    public void replaceProject(String projectPath, MultipartFile[] files) throws IOException {
        Path projectRoot = getAbsoluteProjectPath(projectPath, "");

        if (Files.exists(projectRoot)) {
            LOGGER.warn("Deleting existing project directory: {}", projectRoot);
            FileUtils.deleteDirectory(projectRoot.toFile());
        }

        Files.createDirectories(projectRoot);
        LOGGER.info("Recreated project directory: {}", projectRoot);

        for (MultipartFile file : files) {
            String relativePath = file.getOriginalFilename();
            if (relativePath == null || relativePath.isBlank()) {
                continue;
            }

            Path targetPath = projectRoot.resolve(relativePath).normalize();
            if (!targetPath.startsWith(projectRoot)) {
                LOGGER.error("Path traversal attempt blocked for uploaded file: {}", relativePath);
                continue;
            }

            Files.createDirectories(targetPath.getParent());
            file.transferTo(targetPath);
            LOGGER.debug("Wrote uploaded file to: {}", targetPath);
        }
        LOGGER.info("Successfully replaced project '{}' with {} files.", projectPath, files.length);
    }

    private Path getAbsoluteProjectPath(String projectPath, String relativePathInProject) {
        Path projectRoot = workspaceRoot.resolve(projectPath).normalize();
        // Security check to ensure projectPath doesn't go up directories
        if (!projectRoot.startsWith(workspaceRoot) || projectPath.contains("..")) {
            throw new IllegalArgumentException("Invalid project path specified: " + projectPath);
        }

        if (!StringUtils.hasText(relativePathInProject) || ".".equals(relativePathInProject) || "/".equals(relativePathInProject)) {
            return projectRoot;
        }

        Path resolvedPath = projectRoot.resolve(relativePathInProject).normalize();
        if (!resolvedPath.startsWith(projectRoot)) {
            throw new IllegalArgumentException("Path traversal attempt detected: " + relativePathInProject);
        }
        return resolvedPath;
    }

    private String getRelativePathInProject(String projectPath, Path absolutePath) {
        Path projectRoot = workspaceRoot.resolve(projectPath);
        String relative = projectRoot.relativize(absolutePath).toString();
        // Ensure consistent path separators
        return relative.replace(File.separator, "/");
    }
}