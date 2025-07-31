/**
 * 文件头注释：
 * RenameFileRequest.java
 * 该文件定义了一个数据传输对象 (DTO)，用于封装重命名文件或目录的请求。
 * 它是一个不可变的记录(record)，由 FileController 用于接收重命名操作的参数。
 */
package com.example.webideabackend.model;

import jakarta.validation.constraints.NotBlank;

/**
 * 一个记录(record)，用于封装文件重命名操作所需的数据。
 *
 * @param projectPath 目标所属的项目名称。
 * @param oldPath 要重命名的文件或目录的原始路径。
 * @param newName 文件或目录的新名称 (注意：不是完整路径)。
 */
public record RenameFileRequest(
        @NotBlank String projectPath,
        @NotBlank String oldPath,
        @NotBlank String newName) {
}