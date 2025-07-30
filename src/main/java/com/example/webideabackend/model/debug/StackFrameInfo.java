/**
 * StackFrameInfo.java
 *
 * 代表调用栈中的一个帧。
 */
package com.example.webideabackend.model.debug;

public record StackFrameInfo(
        String methodName,
        String fileName,
        int lineNumber
) {}