package com.example.webideabackend.model;

import lombok.Data;

@Data
public class FileContentRequest {
    private String path;
    private String content;
}