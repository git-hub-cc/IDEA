/**
 * Breakpoint.java
 *
 * 该文件定义了一个数据传输对象(DTO)，用于封装从前端传递到后端的断点信息。
 * 它是一个不可变的记录(record)，包含了设置或移除一个断点所需的所有信息。
 */
package com.example.webideabackend.model;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * 封装断点信息的记录。
 *
 * @param filePath 要设置断点的文件的相对路径。
 * @param lineNumber 断点所在的行号 (从1开始)。
 * @param enabled 断点是启用还是禁用。
 */
public record Breakpoint(
        @NotBlank String filePath,
        @Min(1) int lineNumber,
        boolean enabled // true for setting, false for removing
) {}