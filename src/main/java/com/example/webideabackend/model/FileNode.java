package com.example.webideabackend.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

/**
 * Represents a file or directory in the file system tree.
 * This class is intentionally a mutable POJO rather than an immutable record
 * because it needs to hold UI-specific state (like isExpanded, isDirty)
 * that can change during user interaction without recreating the entire tree.
 */
@Data
@NoArgsConstructor
public class FileNode {

    private String name;
    private String path; // Full path relative to the workspace root
    private String type; // "file" or "folder"
    private Long size; // Size in bytes
    private Long lastModified; // Timestamp
    private List<FileNode> children; // List of child nodes, only for "folder" type

    /**
     * UI State: Whether the folder is expanded in the file tree.
     */
    private boolean isExpanded;

    /**
     * UI State: Whether the file has been modified in the editor but not yet saved.
     */
    private boolean isDirty;
}