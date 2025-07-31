/**
 * 文件头注释：
 * CreateFileRequest.java
 * 该文件定义了一个数据传输对象 (DTO)，用于封装创建新文件或目录的请求。
 * 它是一个不可变的记录(record)，主要由 FileController 使用，以接收来自客户端的请求体。
 */
package com.example.webideabackend.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 一个记录(record)，封装了创建新文件或目录所需的数据。
 *
 * @param projectPath 目标所属的项目名称。
 * @param parentPath 新建项的父目录路径。
 * @param name       新建文件或目录的名称。
 * @param type       创建的类型，必须是 "file" 或 "directory"。
 */
public record CreateFileRequest(
        @NotBlank String projectPath,
        @NotBlank String parentPath,
        @NotBlank String name,
        @NotBlank @Pattern(regexp = "file|directory|folder", message = "Type must be 'file', 'directory', or 'folder'") String type) {
}