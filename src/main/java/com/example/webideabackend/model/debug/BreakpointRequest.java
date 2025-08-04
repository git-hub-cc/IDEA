package com.example.webideabackend.model.debug;

import lombok.Data;

@Data
public class BreakpointRequest {
    private String filePath;
    private int lineNumber;
    private boolean enabled;
}