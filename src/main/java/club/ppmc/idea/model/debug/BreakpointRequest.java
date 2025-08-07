/**
 * BreakpointRequest.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装从前端传递到后端的切换断点的请求。
 * 它由 DebugController 接收，并传递给 DebugService 来处理断点的设置或移除。
 */
package club.ppmc.idea.model.debug;

/**
 * 封装了切换断点所需数据的记录。
 *
 * @param filePath 要设置断点的文件的相对路径。
 * @param lineNumber 断点所在的行号 (从1开始)。
 * @param enabled 断点是启用 (true) 还是禁用/移除 (false)。
 */
public record BreakpointRequest(String filePath, int lineNumber, boolean enabled) {}