/**
 * LocationInfo.java
 *
 * 封装了调试器暂停点的精确位置信息。
 */
package com.example.webideabackend.model.debug;

public record LocationInfo(
        String filePath,
        String fileName,
        int lineNumber
) {}