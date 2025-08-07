/**
 * LocationInfo.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装调试器暂停时代码执行的精确位置信息。
 * 它是 PausedEventData 的一部分，由 DebugService 创建并发送到前端。
 */
package club.ppmc.idea.model.debug;

/**
 * 封装了调试器暂停点的精确位置信息的记录。
 *
 * @param filePath 暂停点所在源文件的完整相对路径。
 * @param fileName 暂停点所在源文件的文件名。
 * @param lineNumber 暂停点所在的行号。
 */
public record LocationInfo(String filePath, String fileName, int lineNumber) {}