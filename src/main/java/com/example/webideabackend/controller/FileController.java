package com.example.webideabackend.controller;

import com.example.webideabackend.model.CreateFileRequest;
import com.example.webideabackend.model.FileContentRequest;
import com.example.webideabackend.model.FileNode;
import com.example.webideabackend.model.RenameFileRequest;
import com.example.webideabackend.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
// ========================= 关键修改 START: 导入新类 =========================
import org.springframework.http.ContentDisposition;
// ========================= 关键修改 END ===========================
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
// ========================= 关键修改 START: 导入新类 =========================
import java.nio.charset.StandardCharsets;
// ========================= 关键修改 END ===========================
import java.nio.file.Path;
import java.util.List;

@RestController
@RequestMapping("/api")
public class FileController {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileController.class);

    private final FileService fileService;

    @Autowired
    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

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

    @GetMapping("/files/content")
    public ResponseEntity<byte[]> getFileContent(
            @RequestParam String projectPath,
            @RequestParam String path) {
        try {
            byte[] contentBytes = fileService.readFileContent(projectPath, path);

            String filename = Path.of(path).getFileName().toString();
            HttpHeaders headers = new HttpHeaders();

            // ========================= 关键修改 START: 修复中文文件名问题 =========================
            // 使用 ContentDisposition.builder 来正确编码包含非ASCII字符的文件名
            // 之前的 headers.setContentDispositionFormData("attachment", filename) 不支持UTF-8
            ContentDisposition contentDisposition = ContentDisposition.builder("attachment")
                    .filename(filename, StandardCharsets.UTF_8) // 明确指定UTF-8编码
                    .build();
            headers.setContentDisposition(contentDisposition);

            // 确保 Content-Type 依然设置正确
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            // ========================= 关键修改 END ========================================

            return new ResponseEntity<>(contentBytes, headers, HttpStatus.OK);

        } catch (IOException e) {
            LOGGER.error("Error reading file content for project '{}', path: {}", projectPath, path, e);
            return new ResponseEntity<>(new byte[0], HttpStatus.NOT_FOUND);
        }
    }

    @PostMapping("/files/content")
    public ResponseEntity<String> saveFileContent(@RequestBody FileContentRequest request) {
        try {
            fileService.writeFileContent(request.projectPath(), request.path(), request.content());
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

    /**
     * 将文件上传到项目中的指定子目录。
     * 用于支持从前端通过粘贴操作上传文件。
     *
     * @param projectPath     目标项目。
     * @param destinationPath 文件将被粘贴到的目录，相对于项目根目录。如果为空，则为项目根目录。
     * @param files           要上传的文件数组。
     * @return 操作结果的ResponseEntity。
     */
    @PostMapping("/files/upload-to-path")
    public ResponseEntity<?> uploadFilesToPath(
            @RequestParam("projectPath") String projectPath,
            @RequestParam(value = "destinationPath", defaultValue = "") String destinationPath,
            @RequestParam("files") MultipartFile[] files) {
        try {
            fileService.uploadFilesToPath(projectPath, destinationPath, files);
            return ResponseEntity.ok(files.length + " 个文件已成功上传。");
        } catch (IOException e) {
            LOGGER.error("Failed to upload files to project '{}' at path '{}'", projectPath, destinationPath, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("上传文件失败: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            LOGGER.error("Invalid arguments for file upload: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }
}