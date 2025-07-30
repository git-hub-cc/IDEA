package com.example.webideabackend.model;

import lombok.Data;

@Data
public class RenameFileRequest {
    private String oldPath;
    private String newPath; // Full new path
}