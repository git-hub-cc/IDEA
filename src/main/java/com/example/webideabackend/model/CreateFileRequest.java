package com.example.webideabackend.model;

import lombok.Data;

@Data
public class CreateFileRequest {
    private String parentPath; // Path of the directory where to create
    private String name;       // Name of the new file/directory
    private String type;       // "file" or "directory"
}