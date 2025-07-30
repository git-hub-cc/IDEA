/**
 * PausedEventData.java
 *
 * 聚合了当调试器暂停时需要发送给前端的所有信息。
 */
package com.example.webideabackend.model.debug;

import java.util.List;

public record PausedEventData(
        LocationInfo location,
        List<VariableInfo> variables,
        List<StackFrameInfo> callStack
) {}