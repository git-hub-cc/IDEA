package com.example.webideabackend.service;

import com.example.webideabackend.model.FileNode;
import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final SettingsService settingsService;

    // ========================= 关键修改 START: 移除 @Value 注入 =========================
    // 构造函数不再接收 workspaceRootPath 字符串，而是只依赖 SettingsService
    public FileService(SettingsService settingsService) {
        this.settingsService = settingsService;
        // 构造函数中的初始化检查仍然保留，以确保应用首次启动时默认目录存在
        try {
            Path initialWorkspaceRoot = getWorkspaceRoot();
            LOGGER.info("FileService initialized. Initial workspace root is: {}", initialWorkspaceRoot);
        } catch (Exception e) {
            // 在构造函数中只记录错误，因为 getWorkspaceRoot 会在每次使用时处理创建
            LOGGER.error("Failed to check initial workspace root directory during construction.", e);
        }
    }

    /**
     * 实时从 SettingsService 获取工作区根目录，并确保该目录存在。
     * 这是解决问题的核心。
     * @return 当前配置的工作区根目录的 Path 对象。
     */
    private Path getWorkspaceRoot() {
        // 1. 实时从设置服务获取路径
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();

        // 2. 提供一个安全的默认值
        if (workspaceRootPath == null || workspaceRootPath.isBlank()) {
            workspaceRootPath = "./workspace";
        }

        Path resolvedPath = Paths.get(workspaceRootPath).toAbsolutePath().normalize();

        // 3. 每次获取路径时，都检查它是否存在。如果不存在，则创建它。
        // 这确保了即使用户在运行时更改了路径，新目录也能被正确创建。
        if (Files.notExists(resolvedPath)) {
            try {
                Files.createDirectories(resolvedPath);
                LOGGER.info("Workspace root directory did not exist. Created: {}", resolvedPath);
            } catch (IOException e) {
                // 如果创建失败（例如，由于权限问题），则抛出运行时异常
                LOGGER.error("Fatal: Could not create workspace root directory at: {}", resolvedPath, e);
                throw new RuntimeException("Could not create workspace directory: " + resolvedPath, e);
            }
        }

        return resolvedPath;
    }
    // ========================= 关键修改 END ============================================

    public List<String> getProjectList() throws IOException {
        // 所有方法都通过调用 getWorkspaceRoot() 来获取最新的路径
        Path workspaceRoot = getWorkspaceRoot();
        try (Stream<Path> stream = Files.list(workspaceRoot)) {
            return stream
                    .filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> !name.startsWith("."))
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

    public void uploadFilesToPath(String projectPath, String destinationPath, MultipartFile[] files) throws IOException {
        Path destinationDir = getAbsoluteProjectPath(projectPath, destinationPath);

        if (Files.notExists(destinationDir)) {
            Files.createDirectories(destinationDir);
            LOGGER.info("Created destination directory for upload: {}", destinationDir);
        } else if (!Files.isDirectory(destinationDir)) {
            throw new IOException("目标路径不是一个目录: " + destinationPath);
        }

        for (MultipartFile file : files) {
            String relativePath = file.getOriginalFilename();
            if (relativePath == null || relativePath.isBlank()) {
                continue;
            }

            Path targetPath = destinationDir.resolve(relativePath).normalize();

            if (!targetPath.startsWith(destinationDir)) {
                LOGGER.error("Path traversal attempt blocked for uploaded file: {}", relativePath);
                throw new IOException("无效的文件名，可能包含非法路径: " + relativePath);
            }

            if (targetPath.getParent() != null) {
                Files.createDirectories(targetPath.getParent());
            }

            file.transferTo(targetPath);
            LOGGER.debug("Uploaded item to: {}", targetPath);
        }
        LOGGER.info("Successfully uploaded {} items to project '{}' at '{}'.", files.length, projectPath, destinationPath);
    }

    private Path getAbsoluteProjectPath(String projectPath, String relativePathInProject) {
        Path workspaceRoot = getWorkspaceRoot();
        Path projectRoot = workspaceRoot.resolve(projectPath).normalize();

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
        Path workspaceRoot = getWorkspaceRoot();
        Path projectRoot = workspaceRoot.resolve(projectPath);
        String relative = projectRoot.relativize(absolutePath).toString();

        return relative.replace(File.separator, "/");
    }
}