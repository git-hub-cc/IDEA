/**
 * 文件头注释：
 * CompilationResult.java
 * 该文件定义了一个数据传输对象 (DTO)，用于封装单条编译结果（如错误、警告或信息）。
 * 它是一个不可变的记录(record)，设计用于在编译服务和前端之间传递结构化的诊断信息。
 */
package com.example.webideabackend.model;

/**
 * 一个记录(record)，代表一条编译结果。
 * 使用 JDK 17 的 record 类型，提供了简洁的语法和不可变性保证。
 *
 * @param type         结果类型 ("ERROR", "WARNING", "INFO")
 * @param message      诊断信息
 * @param filePath     相关文件的路径
 * @param lineNumber   问题所在的行号 (可能为空)
 * @param columnNumber 问题所在的列号 (可能为空)
 */
public record CompilationResult(
        String type,
        String message,
        String filePath,
        Integer lineNumber,
        Integer columnNumber) {
}