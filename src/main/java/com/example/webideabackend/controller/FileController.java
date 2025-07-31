package com.example.webideabackend.controller;

import com.example.webideabackend.model.CreateFileRequest;
import com.example.webideabackend.model.FileContentRequest;
import com.example.webideabackend.model.FileNode;
import com.example.webideabackend.model.RenameFileRequest;
import com.example.webideabackend.service.FileService;
import com.example.webideabackend.service.LanguageServerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api") // Change to /api to group projects and files
public class FileController {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileController.class);

    private final FileService fileService;
    private final LanguageServerService languageServerService;

    @Autowired
    public FileController(FileService fileService, LanguageServerService languageServerService) {
        this.fileService = fileService;
        this.languageServerService = languageServerService;
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
    public ResponseEntity<String> getFileContent(
            @RequestParam String projectPath,
            @RequestParam String path) {
        try {
            String content = fileService.readFileContent(projectPath, path);
            languageServerService.fileOpened(projectPath, path, content);
            return ResponseEntity.ok(content);
        } catch (IOException e) {
            LOGGER.error("Error reading file content for project '{}', path: {}", projectPath, path, e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        }
    }

    // Records are updated to include projectPath
    @PostMapping("/files/content")
    public ResponseEntity<String> saveFileContent(@RequestBody FileContentRequest request) {
        try {
            fileService.writeFileContent(request.projectPath(), request.path(), request.content());
            languageServerService.fileSaved(request.projectPath(), request.path());
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