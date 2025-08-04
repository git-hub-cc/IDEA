package com.example.webideabackend.model.debug;

/**
 * 封装所有发送到前端的调试相关WebSocket事件。
 * 这是一个顶层的、通用的数据传输对象（DTO）。
 *
 * @param type 事件类型，如 "STARTED", "PAUSED", "TERMINATED" 等。
 * @param data 事件相关的具体数据负载。其类型取决于事件类型。
 *             例如，对于 "PAUSED" 事件，data 应该是 PausedEventData 类型。
 *             对于 "STARTED" 等事件，data 可以是 null。
 * @param <T>  数据负载的泛型类型。
 */
public record WsDebugEvent<T>(
        String type,
        T data
) {}