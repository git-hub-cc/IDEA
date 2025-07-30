/**
 * TerminalResizeRequest.java
 *
 * 该文件定义了一个DTO，用于从前端向后端传递终端尺寸调整的信息。
 */
package com.example.webideabackend.model;

/**
 * 封装终端尺寸信息的记录。
 *
 * @param cols 终端的列数。
 * @param rows 终端的行数。
 */
public record TerminalResizeRequest(int cols, int rows) {
}