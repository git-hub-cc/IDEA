/**
 * DebugEvent.java
 *
 * 该文件定义了一个通用的数据传输对象(DTO)，用于将后端的调试事件发送到前端。
 * 它现在包含一个自定义的 toString() 方法，以确保它可以被安全地转换为JSON字符串。
 */
package com.example.webideabackend.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.google.gson.Gson;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DebugEvent {

    private EventType type;
    private Object data;

    // 使用 transient 关键字防止 gson 实例本身被序列化
    private static final transient Gson gson = new Gson();

    public enum EventType {
        PAUSED,
        RESUMED,
        TERMINATED,
        STARTED
    }

    public static DebugEvent paused(Object pausedData) {
        return new DebugEvent(EventType.PAUSED, pausedData);
    }

    public static DebugEvent resumed() {
        return new DebugEvent(EventType.RESUMED, null);
    }

    public static DebugEvent terminated() {
        return new DebugEvent(EventType.TERMINATED, null);
    }

    public static DebugEvent started() {
        return new DebugEvent(EventType.STARTED, null);
    }

    /**
     * 覆盖 toString() 方法，将其序列化为JSON字符串。
     * 这是一个防御性措施，以确保即使在需要字符串的地方也能正确工作。
     * @return 此对象的JSON字符串表示形式。
     */
    @Override
    public String toString() {
        return gson.toJson(this);
    }
}