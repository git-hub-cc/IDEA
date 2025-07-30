// src/main/java/com/example/webideabackend/model/FileNode.java
package com.example.webideabackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FileNode {
    private String name;
    private String path; // Full path relative to workspace root
    private String type; // "file" or "folder" (changed from "directory")
    private Long size; // bytes
    private Long lastModified; // timestamp
    private List<FileNode> children;
    private String gitStatus; // Added for frontend display: "modified", "added", "deleted", "untracked", "unchanged"
    private boolean isExpanded; // Added for frontend state: folder expanded or not
    private boolean isDirty; // Added for frontend state: file content modified
}