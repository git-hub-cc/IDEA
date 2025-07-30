// src/main/java/com/example/webideabackend/controller/FileController.java
package com.example.webideabackend.controller;

import com.example.webideabackend.model.CreateFileRequest;
import com.example.webideabackend.model.FileContentRequest;
import com.example.webideabackend.model.FileNode;
import com.example.webideabackend.model.RenameFileRequest;
import com.example.webideabackend.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private static final Logger logger = LoggerFactory.getLogger(FileController.class);

    private final FileService fileService;

    @Autowired
    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping("/tree")
    public ResponseEntity<?> getFileTree(@RequestParam(defaultValue = ".") String path) {
        try {
            FileNode fileTree = fileService.getFileTree(path);
            return ResponseEntity.ok(fileTree);
        } catch (IOException e) {
            logger.error("Error getting file tree for path: " + path, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to retrieve file tree: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            logger.error("Invalid path argument: " + path, e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }

    @GetMapping("/content")
    public ResponseEntity<String> getFileContent(@RequestParam String path) {
        try {
            String content = fileService.readFileContent(path);
            return ResponseEntity.ok(content);
        } catch (IOException e) {
            logger.error("Error reading file content for path: " + path, e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        }
    }

    @PostMapping("/content")
    public ResponseEntity<String> saveFileContent(@RequestBody FileContentRequest request) {
        try {
            fileService.writeFileContent(request.getPath(), request.getContent());
            return ResponseEntity.ok("File saved successfully.");
        } catch (IOException e) {
            logger.error("Failed to save file: " + request.getPath(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to save file: " + e.getMessage());
        }
    }

    @PostMapping("/create")
    public ResponseEntity<String> createFile(@RequestBody CreateFileRequest request) {
        try {
            fileService.createFile(request.getParentPath(), request.getName(), request.getType());
            return ResponseEntity.ok("Created " + request.getType() + ": " + request.getName());
        } catch (IOException e) {
            logger.error("Failed to create " + request.getType() + ": " + request.getParentPath() + "/" + request.getName(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to create: " + e.getMessage());
        } catch (IllegalArgumentException e) {
            logger.error("Invalid type for creation: " + request.getType(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }

    @DeleteMapping("/delete")
    public ResponseEntity<String> deleteFile(@RequestParam String path) {
        try {
            fileService.deleteFile(path);
            return ResponseEntity.ok("Deleted: " + path);
        } catch (IOException e) {
            logger.error("Failed to delete: " + path, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to delete: " + e.getMessage());
        }
    }

    @PutMapping("/rename")
    public ResponseEntity<String> renameFile(@RequestBody RenameFileRequest request) {
        try {
            // New path here should be just the new file/folder name
            fileService.renameFile(request.getOldPath(), request.getNewPath());
            return ResponseEntity.ok("Renamed " + request.getOldPath() + " to " + request.getNewPath());
        } catch (IOException e) {
            logger.error("Failed to rename " + request.getOldPath() + " to " + request.getNewPath(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to rename: " + e.getMessage());
        }
    }
}