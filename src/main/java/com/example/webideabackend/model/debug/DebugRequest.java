package com.example.webideabackend.model.debug;

import lombok.Data;

@Data
public class DebugRequest {
    private String projectPath;
    private String mainClass;
}