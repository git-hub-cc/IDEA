/**
 * FileService.java
 *
 * 该服务负责处理所有与文件系统相关的操作，如列出项目、读取文件树、读写文件内容等。
 * 它是应用与工作区文件交互的核心。
 * 它依赖 SettingsService 来动态获取工作区的根目录，确保所有操作都在正确的、可配置的目录下进行。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.FileNode;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class FileService {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileService.class);

    private final SettingsService settingsService;

    public FileService(SettingsService settingsService) {
        this.settingsService = settingsService;
        // 在构造时进行一次初始检查，确保默认目录存在
        try {
            getWorkspaceRoot();
        } catch (RuntimeException e) {
            LOGGER.error("无法在服务初始化时创建工作区目录。", e);
        }
    }

    /**
     * 实时从 SettingsService 获取工作区根目录，并确保该目录存在。
     * 这是解决配置动态更新问题的核心。
     *
     * @return 当前配置的工作区根目录的 Path 对象。
     * @throws RuntimeException 如果无法创建工作区目录（例如由于权限问题）。
     */
    private Path getWorkspaceRoot() {
        // 1. 实时从设置服务获取路径
        String workspaceRootPath = settingsService.getSettings().getWorkspaceRoot();

        // 2. 提供一个安全的默认值
        if (!StringUtils.hasText(workspaceRootPath)) {
            workspaceRootPath = "./workspace";
        }
        var resolvedPath = Paths.get(workspaceRootPath).toAbsolutePath().normalize();

        // 3. 每次获取路径时，都检查它是否存在。如果不存在，则创建它。
        if (Files.notExists(resolvedPath)) {
            try {
                Files.createDirectories(resolvedPath);
                LOGGER.info("工作区根目录不存在，已创建: {}", resolvedPath);
            } catch (IOException e) {
                LOGGER.error("致命错误: 无法在以下路径创建工作区根目录: {}", resolvedPath, e);
                throw new RuntimeException("无法创建工作区目录: " + resolvedPath, e);
            }
        }
        return resolvedPath;
    }

    public List<String> getProjectList() throws IOException {
        Path workspaceRoot = getWorkspaceRoot();
        try (Stream<Path> stream = Files.list(workspaceRoot)) {
            return stream
                    .filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> !name.startsWith(".")) // 忽略隐藏目录
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .toList();
        }
    }

    public FileNode getFileTree(String projectPath, String relativePathInProject) throws IOException {
        var absolutePath = getValidatedAbsolutePath(projectPath, relativePathInProject);
        if (Files.notExists(absolutePath)) {
            throw new IOException("路径未找到: " + absolutePath);
        }
        return buildFileNodeRecursively(projectPath, absolutePath);
    }

    private FileNode buildFileNodeRecursively(String projectPath, Path path) throws IOException {
        var file = path.toFile();
        var node = new FileNode();

        node.setName(file.getName());
        node.setPath(getRelativePath(projectPath, path));
        node.setType(file.isDirectory() ? "folder" : "file");
        node.setSize(file.isDirectory() ? 0L : file.length());
        node.setLastModified(file.lastModified());

        if (file.isDirectory()) {
            try (Stream<Path> stream = Files.list(path)) {
                List<FileNode> children =
                        stream
                                .filter(p -> !p.getFileName().toString().startsWith("."))
                                .map(
                                        p -> {
                                            try {
                                                return buildFileNodeRecursively(projectPath, p);
                                            } catch (IOException e) {
                                                // 在 lambda 中无法直接抛出受检异常，包装成运行时异常
                                                throw new RuntimeException(e);
                                            }
                                        })
                                .sorted(
                                        Comparator.comparing((FileNode n) -> "folder".equals(n.getType()) ? 0 : 1)
                                                .thenComparing(FileNode::getName, String.CASE_INSENSITIVE_ORDER))
                                .toList();
                node.setChildren(children);
            }
        }
        return node;
    }

    public byte[] readFileContent(String projectPath, String relativePathInProject)
            throws IOException {
        var absolutePath = getValidatedAbsolutePath(projectPath, relativePathInProject);
        if (Files.isDirectory(absolutePath)) {
            throw new IOException("无法读取目录的内容: " + absolutePath);
        }
        return Files.readAllBytes(absolutePath);
    }

    public void writeFileContent(String projectPath, String relativePathInProject, String content)
            throws IOException {
        var absolutePath = getValidatedAbsolutePath(projectPath, relativePathInProject);
        Files.createDirectories(absolutePath.getParent());
        Files.writeString(absolutePath, content);
    }

    public void createFile(String projectPath, String parentRelativePath, String name, String type)
            throws IOException {
        var parentAbsolutePath = getValidatedAbsolutePath(projectPath, parentRelativePath);
        var newPath = parentAbsolutePath.resolve(name).normalize();

        // 额外的安全检查，防止创建到父目录之外
        if (!newPath.startsWith(parentAbsolutePath)) {
            throw new IOException("检测到无效的文件名，可能包含路径操纵字符: " + name);
        }

        if (Files.exists(newPath)) {
            throw new IOException("文件或目录已存在: " + newPath);
        }

        switch (type.toLowerCase()) {
            case "file" -> Files.createFile(newPath);
            case "directory", "folder" -> Files.createDirectory(newPath);
            default -> throw new IllegalArgumentException("无效的创建类型: " + type);
        }
    }

    public void deleteFile(String projectPath, String relativePathInProject) throws IOException {
        var absolutePath = getValidatedAbsolutePath(projectPath, relativePathInProject);
        // 不允许删除项目根目录
        if (getValidatedAbsolutePath(projectPath, "").equals(absolutePath)) {
            throw new IOException("不允许删除项目根目录。");
        }
        if (Files.isDirectory(absolutePath)) {
            FileUtils.deleteDirectory(absolutePath.toFile());
        } else {
            Files.delete(absolutePath);
        }
    }

    public void renameFile(String projectPath, String oldRelativePath, String newName)
            throws IOException {
        var oldAbsolutePath = getValidatedAbsolutePath(projectPath, oldRelativePath);
        var newAbsolutePath = oldAbsolutePath.resolveSibling(newName);

        if (Files.notExists(oldAbsolutePath)) {
            throw new IOException("源路径未找到: " + oldAbsolutePath);
        }
        if (Files.exists(newAbsolutePath)) {
            throw new IOException("目标路径已存在: " + newAbsolutePath);
        }
        Files.move(oldAbsolutePath, newAbsolutePath);
    }

    public void replaceProject(String projectPath, MultipartFile[] files) throws IOException {
        Path projectRoot = getValidatedAbsolutePath(projectPath, "");

        if (Files.exists(projectRoot)) {
            LOGGER.warn("正在删除已存在的项目目录: {}", projectRoot);
            FileUtils.deleteDirectory(projectRoot.toFile());
        }

        Files.createDirectories(projectRoot);
        LOGGER.info("已重新创建项目目录: {}", projectRoot);

        uploadFilesToPathInternal(projectRoot, files);
        LOGGER.info("成功使用 {} 个文件替换了项目 '{}'。", files.length, projectPath);
    }

    public void uploadFilesToPath(String projectPath, String destinationPath, MultipartFile[] files)
            throws IOException {
        Path destinationDir = getValidatedAbsolutePath(projectPath, destinationPath);

        if (Files.notExists(destinationDir)) {
            Files.createDirectories(destinationDir);
            LOGGER.info("已为上传创建目标目录: {}", destinationDir);
        } else if (!Files.isDirectory(destinationDir)) {
            throw new IOException("目标路径不是一个目录: " + destinationPath);
        }

        uploadFilesToPathInternal(destinationDir, files);
        LOGGER.info("成功上传 {} 个条目到项目 '{}' 的 '{}' 路径下。", files.length, projectPath, destinationPath);
    }

    // ========================= 新增 START =========================
    /**
     * 删除一个完整的项目目录。
     *
     * @param projectName 要删除的项目的名称。
     * @throws IOException 如果删除过程中发生I/O错误。
     * @throws IllegalArgumentException 如果项目名称无效或试图删除工作区外的目录。
     */
    public void deleteProject(String projectName) throws IOException {
        Path workspaceRoot = getWorkspaceRoot();
        Path projectPath = workspaceRoot.resolve(projectName).normalize();

        // 安全校验
        if (!projectPath.startsWith(workspaceRoot)) {
            throw new IllegalArgumentException("检测到路径遍历攻击: " + projectName);
        }
        if (projectName.contains("..") || !StringUtils.hasText(projectName)) {
            throw new IllegalArgumentException("无效的项目名称: " + projectName);
        }
        if (Files.notExists(projectPath)) {
            throw new IOException("项目不存在: " + projectName);
        }
        if (!Files.isDirectory(projectPath)) {
            throw new IOException("目标不是一个目录，无法作为项目删除: " + projectName);
        }

        // 执行删除
        FileUtils.deleteDirectory(projectPath.toFile());
        LOGGER.info("项目 '{}' 已被成功删除。", projectName);
    }
    // ========================= 新增 END ===========================

    private void uploadFilesToPathInternal(Path destinationDir, MultipartFile[] files) throws IOException {
        for (MultipartFile file : files) {
            String originalFilename = file.getOriginalFilename();
            if (!StringUtils.hasText(originalFilename)) {
                continue;
            }

            Path targetPath = destinationDir.resolve(originalFilename).normalize();
            // 安全检查：确保目标路径仍在目标目录内，防止路径遍历攻击 (e.g., ../../..)
            if (!targetPath.startsWith(destinationDir)) {
                LOGGER.error("检测到路径遍历攻击并已阻止，上传文件: {}", originalFilename);
                throw new IOException("无效的文件名，可能包含非法路径: " + originalFilename);
            }

            if (targetPath.getParent() != null) {
                Files.createDirectories(targetPath.getParent());
            }

            file.transferTo(targetPath);
            LOGGER.debug("已将上传的文件写入: {}", targetPath);
        }
    }

    /**
     * 将项目内的相对路径解析为绝对路径，并进行安全校验。
     *
     * @param projectPath 项目名称。
     * @param relativePathInProject 项目内的相对路径。
     * @return 经过验证的绝对路径。
     * @throws IllegalArgumentException 如果路径无效或试图遍历到工作区之外。
     */
    private Path getValidatedAbsolutePath(String projectPath, String relativePathInProject) {
        Path workspaceRoot = getWorkspaceRoot();
        Path projectRoot = workspaceRoot.resolve(projectPath).normalize();

        // 检查项目路径本身是否合法
        if (!projectRoot.startsWith(workspaceRoot) || projectPath.contains("..")) {
            throw new IllegalArgumentException("项目路径无效: " + projectPath);
        }

        if (!StringUtils.hasText(relativePathInProject)
                || ".".equals(relativePathInProject)
                || "/".equals(relativePathInProject)) {
            return projectRoot;
        }

        Path resolvedPath = projectRoot.resolve(relativePathInProject).normalize();
        // 检查最终路径是否在项目目录内
        if (!resolvedPath.startsWith(projectRoot)) {
            throw new IllegalArgumentException("检测到路径遍历攻击: " + relativePathInProject);
        }
        return resolvedPath;
    }

    /**
     * 将绝对路径转换为相对于指定项目根目录的路径。
     */
    private String getRelativePath(String projectPath, Path absolutePath) {
        Path projectRoot = getWorkspaceRoot().resolve(projectPath);
        String relative = projectRoot.relativize(absolutePath).toString();
        // 统一使用Unix风格的路径分隔符
        return relative.replace(File.separator, "/");
    }
}