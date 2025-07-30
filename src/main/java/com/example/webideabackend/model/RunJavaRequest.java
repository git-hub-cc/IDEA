package com.example.webideabackend.model;

import lombok.Data;

@Data
public class RunJavaRequest {
    private String projectPath; // Path to the project root
    private String mainClass;   // Fully qualified name of the main class (e.g., com.example.Main)
}