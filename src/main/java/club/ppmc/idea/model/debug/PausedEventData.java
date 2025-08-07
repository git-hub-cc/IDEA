/**
 * PausedEventData.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于聚合当调试器因断点或单步执行而暂停时，
 * 需要发送给前端的所有上下文信息。它是 WsDebugEvent 中 PAUSED 事件的数据负载。
 */
package club.ppmc.idea.model.debug;

import java.util.List;

/**
 * 聚合了调试器暂停时所有相关信息的记录。
 *
 * @param location 当前的暂停位置。
 * @param variables 当前栈帧中可见的局部变量列表。
 * @param callStack 当前线程的完整调用栈信息。
 */
public record PausedEventData(
        LocationInfo location, List<VariableInfo> variables, List<StackFrameInfo> callStack) {}