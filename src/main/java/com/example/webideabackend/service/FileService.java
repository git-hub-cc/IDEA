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

    public FileNode getFileTree(String path) throws IOException {
        var absPath = getAbsolutePath(path);
        if (Files.notExists(absPath)) {
            throw new IOException("Path not found: " + absPath);
        }
        return buildFileNode(absPath);
    }

    private FileNode buildFileNode(Path path) throws IOException {
        var file = path.toFile();
        var node = new FileNode();

        node.setName(file.getName());
        node.setPath(getRelativePath(path));
        node.setType(file.isDirectory() ? "folder" : "file");
        node.setSize(file.length());
        node.setLastModified(file.lastModified());

        if (file.isDirectory()) {
            try (Stream<Path> stream = Files.list(path)) {
                List<FileNode> children = stream
                        .filter(p -> !p.getFileName().toString().startsWith("."))
                        .map(p -> {
                            try {
                                return buildFileNode(p);
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

    public String readFileContent(String path) throws IOException {
        var absPath = getAbsolutePath(path);
        if (Files.isDirectory(absPath)) {
            throw new IOException("Cannot read content of a directory: " + absPath);
        }
        return Files.readString(absPath);
    }

    public void writeFileContent(String path, String content) throws IOException {
        var absPath = getAbsolutePath(path);
        Files.createDirectories(absPath.getParent());
        Files.writeString(absPath, content);
    }

    public void createFile(String parentPath, String name, String type) throws IOException {
        var parentAbsPath = getAbsolutePath(parentPath);
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

    public void deleteFile(String path) throws IOException {
        var absPath = getAbsolutePath(path);
        if (Files.isDirectory(absPath)) {
            FileUtils.deleteDirectory(absPath.toFile());
        } else {
            Files.delete(absPath);
        }
    }

    public void renameFile(String oldPath, String newName) throws IOException {
        var oldAbsPath = getAbsolutePath(oldPath);
        if (Files.notExists(oldAbsPath)) {
            throw new IOException("Source path not found: " + oldAbsPath);
        }
        var newAbsPath = oldAbsPath.resolveSibling(newName);
        if (Files.exists(newAbsPath)) {
            throw new IOException("Target path already exists: " + newAbsPath);
        }
        Files.move(oldAbsPath, newAbsPath);
    }

    public void replaceProject(String projectRelativePath, MultipartFile[] files) throws IOException {
        Path projectRoot = getAbsolutePath(projectRelativePath);

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

            // 安全性检查：确保相对路径不会跳出项目根目录
            Path targetPath = projectRoot.resolve(relativePath).normalize();
            if (!targetPath.startsWith(projectRoot)) {
                LOGGER.error("Path traversal attempt blocked for uploaded file: {}", relativePath);
                continue;
            }

            Files.createDirectories(targetPath.getParent());
            file.transferTo(targetPath);
            LOGGER.debug("Wrote uploaded file to: {}", targetPath);
        }
        LOGGER.info("Successfully replaced project '{}' with {} files.", projectRelativePath, files.length);
    }

    private Path getAbsolutePath(String relativePath) {
        if (!StringUtils.hasText(relativePath) || ".".equals(relativePath)) {
            return workspaceRoot;
        }
        Path resolvedPath = workspaceRoot.resolve(relativePath).normalize();
        if (!resolvedPath.startsWith(workspaceRoot)) {
            throw new IllegalArgumentException("Path traversal attempt detected: " + relativePath);
        }
        return resolvedPath;
    }

    private String getRelativePath(Path absolutePath) {
        String relative = workspaceRoot.relativize(absolutePath).toString();
        return relative.replace(File.separator, "/");
    }
}