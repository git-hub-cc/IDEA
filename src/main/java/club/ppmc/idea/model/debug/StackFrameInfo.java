/**
 * StackFrameInfo.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于表示调用栈中的一个帧（Frame）。
 * 它提供了关于方法调用、文件名和行号的信息，用于在前端UI上渲染调用栈。
 */
package club.ppmc.idea.model.debug;

/**
 * 代表调用栈中的一个帧的记录。
 *
 * @param methodName 当前帧所执行的方法名。
 * @param fileName 方法所在的文件名。
 * @param lineNumber 方法调用的行号。
 */
public record StackFrameInfo(String methodName, String fileName, int lineNumber) {}