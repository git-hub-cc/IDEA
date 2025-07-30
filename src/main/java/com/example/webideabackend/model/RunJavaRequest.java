/**
 * 文件头注释：
 * RunJavaRequest.java
 * 该文件定义了一个数据传输对象 (DTO)，用于封装运行Java应用程序的请求。
 * 它是一个不可变的记录(record)，由 JavaController 用于接收运行命令的参数。
 */
package com.example.webideabackend.model;

import jakarta.validation.constraints.NotBlank;

/**
 * 一个记录(record)，用于封装运行Java应用程序所需的数据。
 *
 * @param projectPath 项目的根路径
 * @param mainClass   要执行的完全限定主类名 (例如, "com.example.Main")
 */
public record RunJavaRequest(
        @NotBlank String projectPath,
        @NotBlank String mainClass) {
}