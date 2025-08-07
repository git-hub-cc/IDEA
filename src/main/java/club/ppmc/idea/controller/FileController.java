/**
 * FileController.java
 *
 * 该控制器处理所有与文件系统交互的HTTP请求。
 * 它提供了文件和目录的增删改查（CRUD）功能，以及项目管理和文件上传功能。
 * 所有操作都通过委托给 FileService 来完成。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.model.CreateFileRequest;
import club.ppmc.idea.model.FileContentRequest;
import club.ppmc.idea.model.FileNode;
import club.ppmc.idea.model.RenameFileRequest;
import club.ppmc.idea.service.FileService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
@Slf4j
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    /**
     * 获取工作区内的所有项目（即一级子目录）。
     */
    @GetMapping("/projects")
    public ResponseEntity<List<String>> getProjects() {
        try {
            return ResponseEntity.ok(fileService.getProjectList());
        } catch (IOException e) {
            log.error("获取项目列表时出错", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Collections.emptyList());
        }
    }

    /**
     * 获取指定项目或其子目录的文件树结构。
     */
    @GetMapping("/files/tree")
    public ResponseEntity<?> getFileTree(
            @RequestParam String projectPath, @RequestParam(defaultValue = "") String path) {
        try {
            FileNode fileTree = fileService.getFileTree(projectPath, path);
            return ResponseEntity.ok(fileTree);
        } catch (IOException e) {
            log.error("为项目 '{}', 路径 '{}' 获取文件树时出错", projectPath, path, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "获取文件树失败: " + e.getMessage()));
        } catch (IllegalArgumentException e) {
            log.warn("获取文件树时路径无效: project='{}', path='{}'", projectPath, path, e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 获取指定文件的内容。
     */
    @GetMapping("/files/content")
    public ResponseEntity<byte[]> getFileContent(
            @RequestParam String projectPath, @RequestParam String path) {
        try {
            byte[] contentBytes = fileService.readFileContent(projectPath, path);
            String filename = Path.of(path).getFileName().toString();
            var headers = new HttpHeaders();

            // 设计改进: 使用 ContentDisposition.builder 来正确编码包含非ASCII字符（如中文）的文件名。
            // 这遵循 RFC 5987 标准，解决了旧方法在某些浏览器下的乱码问题。
            var contentDisposition =
                    ContentDisposition.builder("attachment")
                            .filename(filename, StandardCharsets.UTF_8)
                            .build();
            headers.setContentDisposition(contentDisposition);
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);

            return new ResponseEntity<>(contentBytes, headers, HttpStatus.OK);

        } catch (IOException e) {
            log.warn("读取文件内容失败: project='{}', path='{}'. 原因: {}", projectPath, path, e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 保存或更新文件的内容。
     */
    @PostMapping("/files/content")
    public ResponseEntity<Map<String, String>> saveFileContent(@RequestBody FileContentRequest request) {
        try {
            fileService.writeFileContent(request.projectPath(), request.path(), request.content());
            return ResponseEntity.ok(Map.of("message", "文件保存成功。"));
        } catch (IOException e) {
            log.error("保存文件 '{}' 到项目 '{}' 失败", request.path(), request.projectPath(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "保存文件失败: " + e.getMessage()));
        }
    }

    /**
     * 创建一个新的文件或目录。
     */
    @PostMapping("/files/create")
    public ResponseEntity<Map<String, String>> createFile(@RequestBody CreateFileRequest request) {
        try {
            fileService.createFile(request.projectPath(), request.parentPath(), request.name(), request.type());
            String typeName = "file".equals(request.type()) ? "文件" : "目录";
            return ResponseEntity.ok(Map.of("message", "已成功创建" + typeName + ": " + request.name()));
        } catch (IOException | IllegalArgumentException e) {
            log.error("创建失败: {} in project {}", request, request.projectPath(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "创建失败: " + e.getMessage()));
        }
    }

    /**
     * 删除一个文件或目录。
     */
    @DeleteMapping("/files/delete")
    public ResponseEntity<Map<String, String>> deleteFile(
            @RequestParam String projectPath, @RequestParam String path) {
        try {
            fileService.deleteFile(projectPath, path);
            return ResponseEntity.ok(Map.of("message", "已删除: " + path));
        } catch (IOException e) {
            log.error("删除 '{}' (项目: '{}') 失败", path, projectPath, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "删除失败: " + e.getMessage()));
        }
    }

    /**
     * 重命名一个文件或目录。
     */
    @PutMapping("/files/rename")
    public ResponseEntity<Map<String, String>> renameFile(@RequestBody RenameFileRequest request) {
        try {
            fileService.renameFile(request.projectPath(), request.oldPath(), request.newName());
            return ResponseEntity.ok(Map.of("message", String.format("已将 %s 重命名为 %s", request.oldPath(), request.newName())));
        } catch (IOException e) {
            log.error("重命名 '{}' 到 '{}' (项目: '{}') 失败", request.oldPath(), request.newName(), request.projectPath(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "重命名失败: " + e.getMessage()));
        }
    }

    /**
     * 替换整个项目的内容（通常通过上传zip解压后的文件列表）。
     */
    @PostMapping("/files/replace-project")
    public ResponseEntity<Map<String, String>> replaceProject(
            @RequestParam("projectPath") String projectPath,
            @RequestParam("files") MultipartFile[] files) {
        try {
            fileService.replaceProject(projectPath, files);
            return ResponseEntity.ok(Map.of("message", "项目替换成功。"));
        } catch (IOException e) {
            log.error("替换项目 '{}' 失败", projectPath, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "替换项目失败: " + e.getMessage()));
        }
    }

    /**
     * 将文件上传到项目中的指定子目录。
     */
    @PostMapping("/files/upload-to-path")
    public ResponseEntity<Map<String, String>> uploadFilesToPath(
            @RequestParam("projectPath") String projectPath,
            @RequestParam(defaultValue = "") String destinationPath,
            @RequestParam("files") MultipartFile[] files) {
        try {
            fileService.uploadFilesToPath(projectPath, destinationPath, files);
            return ResponseEntity.ok(Map.of("message", files.length + " 个文件已成功上传。"));
        } catch (IOException | IllegalArgumentException e) {
            log.error("上传文件到项目 '{}' 的路径 '{}' 失败", projectPath, destinationPath, e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "上传文件失败: " + e.getMessage()));
        }
    }
}