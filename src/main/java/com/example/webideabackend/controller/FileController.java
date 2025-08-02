// controller/FileController.java

package com.example.webideabackend.controller;

import com.example.webideabackend.model.CreateFileRequest;
import com.example.webideabackend.model.FileContentRequest;
import com.example.webideabackend.model.FileNode;
import com.example.webideabackend.model.RenameFileRequest;
import com.example.webideabackend.service.FileService;
// ========================= 关键修改 START =========================
// 移除了对 LanguageServerService 的导入
// import com.example.webideabackend.service.LanguageServerService;
// ========================= 关键修改 END ===========================
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api") // Change to /api to group projects and files
public class FileController {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileController.class);
    private static final List<String> TEXT_FILE_EXTENSIONS = Arrays.asList(
            "txt", "java", "js", "html", "css", "xml", "pom", "json", "md", "gitignore", "properties"
    );

    private final FileService fileService;
    // ========================= 关键修改 START =========================
    // 移除了 LanguageServerService 字段
    // private final LanguageServerService languageServerService;
    // ========================= 关键修改 END ===========================


    // ========================= 关键修改 START =========================
    // 更新了构造函数，移除了对 LanguageServerService 的依赖注入
    @Autowired
    public FileController(FileService fileService) {
        this.fileService = fileService;
    }
    // ========================= 关键修改 END ===========================


    @GetMapping("/projects")
    public ResponseEntity<List<String>> getProjects() {
        try {
            return ResponseEntity.ok(fileService.getProjectList());
        } catch (IOException e) {
            LOGGER.error("Error listing projects", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(List.of());
        }
    }

    @GetMapping("/files/tree")
    public ResponseEntity<?> getFileTree(
            @RequestParam String projectPath,
            @RequestParam(defaultValue = "") String path) {
        try {
            FileNode fileTree = fileService.getFileTree(projectPath, path);
            return ResponseEntity.ok(fileTree);
        } catch (IOException e) {
            LOGGER.error("Error getting file tree for project '{}', path: {}", projectPath, path, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to retrieve file tree: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            LOGGER.error("Invalid path argument for project '{}': {}", projectPath, path, e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }

    /**
     * 获取文件内容，既可用于在编辑器中显示，也可用于下载。
     * 此端点返回原始字节流，并设置Content-Disposition头，让浏览器知道如何处理。
     *
     * @param projectPath 项目路径
     * @param path        文件在项目中的相对路径
     * @return 包含文件字节的ResponseEntity
     */
    @GetMapping("/files/content")
    public ResponseEntity<byte[]> getFileContent(
            @RequestParam String projectPath,
            @RequestParam String path) {
        try {
            byte[] contentBytes = fileService.readFileContent(projectPath, path);

            // ========================= 关键修改 START =========================
            // 移除了对 languageServerService.fileOpened 的调用
            // ========================= 关键修改 END ===========================

            String filename = Path.of(path).getFileName().toString();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            headers.setContentDispositionFormData("attachment", filename);

            return new ResponseEntity<>(contentBytes, headers, HttpStatus.OK);

        } catch (IOException e) {
            LOGGER.error("Error reading file content for project '{}', path: {}", projectPath, path, e);
            // 返回一个空的byte数组和404状态码
            return new ResponseEntity<>(new byte[0], HttpStatus.NOT_FOUND);
        }
    }

    /**
     * 检查文件扩展名是否为已知的文本类型。
     * @param filePath 文件路径
     * @return 如果是文本文件则为true，否则为false
     */
    private boolean isTextFile(String filePath) {
        int lastDot = filePath.lastIndexOf('.');
        if (lastDot == -1) {
            return false; // No extension
        }
        String extension = filePath.substring(lastDot + 1).toLowerCase();
        return TEXT_FILE_EXTENSIONS.contains(extension);
    }

    // Records are updated to include projectPath
    @PostMapping("/files/content")
    public ResponseEntity<String> saveFileContent(@RequestBody FileContentRequest request) {
        try {
            fileService.writeFileContent(request.projectPath(), request.path(), request.content());
            // ========================= 关键修改 START =========================
            // 移除了对 languageServerService.fileSaved 的调用
            // ========================= 关键修改 END ===========================
            return ResponseEntity.ok("File saved successfully.");
        } catch (IOException e) {
            LOGGER.error("Failed to save file: {} in project {}", request.path(), request.projectPath(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to save file: " + e.getMessage());
        }
    }

    @PostMapping("/files/create")
    public ResponseEntity<String> createFile(@RequestBody CreateFileRequest request) {
        try {
            fileService.createFile(request.projectPath(), request.parentPath(), request.name(), request.type());
            return ResponseEntity.ok("Created " + request.type() + ": " + request.name());
        } catch (IOException e) {
            LOGGER.error("Failed to create {}: {}/{} in project {}", request.type(), request.parentPath(), request.name(), request.projectPath(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to create: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            LOGGER.error("Invalid type for creation: {}", request.type(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }

    @DeleteMapping("/files/delete")
    public ResponseEntity<String> deleteFile(
            @RequestParam String projectPath,
            @RequestParam String path) {
        try {
            fileService.deleteFile(projectPath, path);
            return ResponseEntity.ok("Deleted: " + path);
        } catch (IOException e) {
            LOGGER.error("Failed to delete: {} in project {}", path, projectPath, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to delete: " + e.getMessage());
        }
    }

    @PutMapping("/files/rename")
    public ResponseEntity<String> renameFile(@RequestBody RenameFileRequest request) {
        try {
            fileService.renameFile(request.projectPath(), request.oldPath(), request.newName());
            return ResponseEntity.ok("Renamed " + request.oldPath() + " to " + request.newName());
        } catch (IOException e) {
            LOGGER.error("Failed to rename {} to {} in project {}", request.oldPath(), request.newName(), request.projectPath(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to rename: " + e.getMessage());
        }
    }

    @PostMapping("/files/replace-project")
    public ResponseEntity<?> replaceProject(
            @RequestParam("projectPath") String projectPath,
            @RequestParam("files") MultipartFile[] files) {
        try {
            fileService.replaceProject(projectPath, files);
            return ResponseEntity.ok("Project replaced successfully.");
        } catch (IOException e) {
            LOGGER.error("Failed to replace project at path: {}", projectPath, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to replace project: " + e.getMessage());
        }
    }
}