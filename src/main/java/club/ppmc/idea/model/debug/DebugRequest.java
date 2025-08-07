/**
 * DebugRequest.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装从前端发起的启动一个新调试会话的请求。
 * 它由 DebugController 接收，并传递给 DebugService 来启动调试进程。
 */
package club.ppmc.idea.model.debug;

/**
 * 封装了启动调试会话所需数据的记录。
 *
 * @param projectPath 要调试的项目名称。
 * @param mainClass 要执行的完全限定主类名 (例如, "com.example.Main")。
 */
public record DebugRequest(String projectPath, String mainClass) {}