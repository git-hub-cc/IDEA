package com.example.webideabackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CompilationResult {
    private String type; // "ERROR", "WARNING", "INFO"
    private String message;
    private String filePath;
    private Integer lineNumber;
    private Integer columnNumber;
}