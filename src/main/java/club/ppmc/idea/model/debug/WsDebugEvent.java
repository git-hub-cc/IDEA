/**
 * WsDebugEvent.java
 *
 * 该文件定义了一个通用的、顶层的数据传输对象 (DTO)，用于封装所有通过WebSocket发送到前端的调试相关事件。
 * 这种包装器模式使得前端可以根据 'type' 字段来分发和处理不同类型的调试事件。
 */
package club.ppmc.idea.model.debug;

/**
 * 封装所有发送到前端的调试相关WebSocket事件。
 *
 * @param type 事件类型，例如 "STARTED", "PAUSED", "RESUMED", "TERMINATED"。
 * @param data 事件相关的具体数据负载。其类型取决于 `type`。
 *             例如，对于 "PAUSED" 事件，`data` 应该是 `PausedEventData` 类型。
 *             对于 "STARTED" 等简单通知事件，`data` 可以是 `null`。
 * @param <T> 数据负载的泛型类型。
 */
public record WsDebugEvent<T>(String type, T data) {}