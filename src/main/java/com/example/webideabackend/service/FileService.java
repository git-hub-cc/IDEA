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

    public byte[] readFileContent(String projectPath, String relativePathInProject) throws IOException {
        var absPath = getAbsoluteProjectPath(projectPath, relativePathInProject);
        if (Files.isDirectory(absPath)) {
            throw new IOException("Cannot read content of a directory: " + absPath);
        }
        return Files.readAllBytes(absPath);
    }

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

    // ========================= 关键修改 START: 优化上传逻辑以支持目录结构 =========================
    /**
     * 将一组文件上传到指定的项目子目录中。
     * 此方法现在能识别并创建文件在上传时的相对目录结构。
     *
     * @param projectPath     目标项目。
     * @param destinationPath 目标子目录的相对路径。
     * @param files           要保存的文件数组，其原始文件名可能包含相对路径。
     * @throws IOException 如果发生I/O错误或检测到路径遍历攻击。
     */
    public void uploadFilesToPath(String projectPath, String destinationPath, MultipartFile[] files) throws IOException {
        // 获取并验证目标目录的绝对路径
        Path destinationDir = getAbsoluteProjectPath(projectPath, destinationPath);

        // 确保目标路径存在并且是一个目录
        if (Files.notExists(destinationDir)) {
            Files.createDirectories(destinationDir);
            LOGGER.info("Created destination directory for upload: {}", destinationDir);
        } else if (!Files.isDirectory(destinationDir)) {
            throw new IOException("目标路径不是一个目录: " + destinationPath);
        }

        for (MultipartFile file : files) {
            // 从 MultipartFile 获取包含相对路径的文件名 (例如, "subdir/file.txt")
            String relativePath = file.getOriginalFilename();
            if (relativePath == null || relativePath.isBlank()) {
                continue;
            }

            // 解析最终的文件路径
            Path targetPath = destinationDir.resolve(relativePath).normalize();

            // 安全检查，确保最终路径仍在目标目录内，防止路径遍历攻击 (如 "..\..\file.txt")
            if (!targetPath.startsWith(destinationDir)) {
                LOGGER.error("Path traversal attempt blocked for uploaded file: {}", relativePath);
                throw new IOException("无效的文件名，可能包含非法路径: " + relativePath);
            }

            // 如果上传的是文件，确保其父目录存在
            if (targetPath.getParent() != null) {
                Files.createDirectories(targetPath.getParent());
            }

            // 保存文件
            file.transferTo(targetPath);
            LOGGER.debug("Uploaded item to: {}", targetPath);
        }
        LOGGER.info("Successfully uploaded {} items to project '{}' at '{}'.", files.length, projectPath, destinationPath);
    }
    // ========================= 关键修改 END ========================================

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