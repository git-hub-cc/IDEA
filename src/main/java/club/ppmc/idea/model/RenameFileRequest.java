/**
 * RenameFileRequest.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装从客户端发起的重命名文件或目录的请求。
 * 它是一个不可变的记录(record)，由 FileController 的 rename 端点使用，以接收结构化的请求体。
 */
package club.ppmc.idea.model;

import jakarta.validation.constraints.NotBlank;

/**
 * 封装了文件重命名操作所需数据的记录。
 *
 * @param projectPath 目标所属的项目名称。
 * @param oldPath 要重命名的文件或目录的原始相对路径。
 * @param newName 文件或目录的新名称 (注意：不是完整路径)。
 */
public record RenameFileRequest(@NotBlank String projectPath, @NotBlank String oldPath, @NotBlank String newName) {}