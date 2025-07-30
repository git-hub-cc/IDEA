// src/main/java/com/example/webideabackend/service/FileService.java
package com.example.webideabackend.service;

import com.example.webideabackend.model.FileNode;
import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class FileService {

    private static final Logger logger = LoggerFactory.getLogger(FileService.class);

    @Value("${app.workspace-root}")
    private String workspaceRootPath;

    // 确保 workspaceRootFile 实际指向一个规范化的 File 对象
    private File workspaceRootFile;

    // 构造器中初始化 workspaceRootFile
    public FileService(@Value("${app.workspace-root}") String workspaceRootPath) {
        this.workspaceRootFile = new File(workspaceRootPath).getAbsoluteFile(); // 转换为绝对路径，确保其存在
        if (!this.workspaceRootFile.exists()) {
            // 如果工作区根目录不存在，尝试创建
            boolean created = this.workspaceRootFile.mkdirs();
            if (created) {
                logger.info("Created workspace root directory: {}", this.workspaceRootFile.getAbsolutePath());
            } else {
                logger.error("Failed to create workspace root directory: {}", this.workspaceRootFile.getAbsolutePath());
            }
        }
        logger.info("Web IDE Workspace Root: {}", this.workspaceRootFile.getAbsolutePath());
    }


    /**
     * Converts a relative path (from frontend) to an absolute path on the server filesystem.
     * Handles empty string or "." as the root of the workspace.
     */
    private Path getAbsolutePath(String relativePath) {
        if (relativePath == null || relativePath.isEmpty() || ".".equals(relativePath)) {
            return workspaceRootFile.toPath().normalize();
        }
        return workspaceRootFile.toPath().resolve(relativePath).normalize();
    }

    /**
     * Converts an absolute path on the server filesystem to a relative path
     * within the defined workspace root, using forward slashes.
     */
    private String getRelativePath(Path absolutePath) {
        // Ensure absolutePath is within the workspaceRoot
        if (!absolutePath.startsWith(workspaceRootFile.toPath())) {
            throw new IllegalArgumentException("Path " + absolutePath + " is outside of workspace root " + workspaceRootFile.toPath());
        }
        String relative = workspaceRootFile.toPath().relativize(absolutePath).toString();
        // For the workspace root itself, the relative path might be an empty string.
        // For consistency with frontend, if it's empty, make it a single dot.
        if (relative.isEmpty()) {
            return ".";
        }
        return relative.replace("\\", "/"); // Standardize to forward slashes for web paths
    }

    public FileNode getFileTree(String path) throws IOException {
        Path absPath = getAbsolutePath(path);
        if (!Files.exists(absPath)) {
            throw new IOException("Path not found: " + absPath.toAbsolutePath());
        }
        return buildFileNode(absPath);
    }

    private FileNode buildFileNode(Path path) {
        File file = path.toFile();
        FileNode node = new FileNode();

        // For the root of the file tree request, set name to the project folder name
        // e.g., if path is 'web-idea-workspace/demo-project', name should be 'demo-project'
        // If the path is the workspace root itself, its name should be 'workspaceRoot' or similar.
        if (path.equals(workspaceRootFile.toPath())) {
            node.setName("workspaceRoot"); // Or any desired root name
            node.setPath("."); // Represents the workspace root itself
        } else {
            node.setName(file.getName());
            node.setPath(getRelativePath(path));
        }

        node.setType(file.isDirectory() ? "folder" : "file"); // Frontend expects "folder" not "directory"
        node.setSize(file.length());
        node.setLastModified(file.lastModified());

        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                node.setChildren(Arrays.stream(children)
                        .map(File::toPath)
                        .filter(p -> !p.getFileName().toString().startsWith(".")) // Exclude hidden files/dirs like .idea, .git
                        .map(this::buildFileNode)
                        .sorted(Comparator
                                .comparing((FileNode n) -> n.getType().equals("folder") ? 0 : 1) // Directories first
                                .thenComparing(FileNode::getName))
                        .collect(Collectors.toList()));
            }
        }
        return node;
    }

    public String readFileContent(String path) throws IOException {
        Path absPath = getAbsolutePath(path);
        if (!Files.exists(absPath) || Files.isDirectory(absPath)) {
            throw new IOException("File not found or is a directory: " + absPath.toAbsolutePath());
        }
        return Files.readString(absPath);
    }

    public void writeFileContent(String path, String content) throws IOException {
        Path absPath = getAbsolutePath(path);
        // Ensure parent directories exist before writing
        Files.createDirectories(absPath.getParent());
        Files.writeString(absPath, content);
    }

    public void createFile(String parentPath, String name, String type) throws IOException {
        Path parentAbsPath = getAbsolutePath(parentPath);
        Path newPath = parentAbsPath.resolve(name);

        if (Files.exists(newPath)) {
            throw new IOException("File or directory already exists: " + newPath.toAbsolutePath());
        }

        if ("file".equalsIgnoreCase(type)) {
            Files.createFile(newPath);
        } else if ("directory".equalsIgnoreCase(type) || "folder".equalsIgnoreCase(type)) { // Also accept "folder"
            Files.createDirectory(newPath);
        } else {
            throw new IllegalArgumentException("Invalid type: " + type);
        }
    }

    public void deleteFile(String path) throws IOException {
        Path absPath = getAbsolutePath(path);
        if (!Files.exists(absPath)) {
            throw new IOException("Path not found: " + absPath.toAbsolutePath());
        }
        if (Files.isDirectory(absPath)) {
            FileUtils.deleteDirectory(absPath.toFile()); // Use Apache Commons IO for recursive delete
        } else {
            Files.delete(absPath);
        }
    }

    public void renameFile(String oldPath, String newName) throws IOException {
        Path oldAbsPath = getAbsolutePath(oldPath);
        // New path should be in the same parent directory
        Path parentAbsPath = oldAbsPath.getParent();
        Path newAbsPath = parentAbsPath.resolve(newName);

        if (!Files.exists(oldAbsPath)) {
            throw new IOException("Old path not found: " + oldAbsPath.toAbsolutePath());
        }
        if (Files.exists(newAbsPath)) {
            throw new IOException("New path already exists: " + newAbsPath.toAbsolutePath());
        }

        Files.move(oldAbsPath, newAbsPath);
    }
}