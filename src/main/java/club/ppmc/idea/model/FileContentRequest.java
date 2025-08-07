/**
 * FileContentRequest.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装从客户端发起的保存或更新文件内容的请求。
 * 它是一个不可变的记录(record)，由 FileController 在处理文件内容写入时使用，接收请求体数据。
 */
package club.ppmc.idea.model;

import jakarta.validation.constraints.NotBlank;

/**
 * 封装了文件路径及其新内容的记录。
 *
 * @param projectPath 目标文件所属的项目名称。
 * @param path 要写入的文件的相对路径（相对于项目根目录）。
 * @param content 要写入的新文件内容。
 */
public record FileContentRequest(
        @NotBlank String projectPath, @NotBlank String path, String content) {}