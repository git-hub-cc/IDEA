/**
 * CreateFileRequest.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装从客户端发起的创建新文件或目录的请求。
 * 它是一个不可变的记录(record)，由 FileController 的 create 端点使用，以接收结构化的请求体。
 */
package club.ppmc.idea.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 封装了创建新文件或目录所需数据的记录。
 *
 * @param projectPath 目标所属的项目名称。
 * @param parentPath 新建项的父目录的相对路径。
 * @param name 新建文件或目录的名称。
 * @param type 创建的类型，必须是 "file" 或 "directory" (或其别名"folder")。
 */
public record CreateFileRequest(
        @NotBlank String projectPath,
        @NotBlank String parentPath,
        @NotBlank String name,
        @NotBlank @Pattern(
                regexp = "file|directory|folder",
                message = "类型必须是 'file', 'directory', 或 'folder'")
        String type) {}