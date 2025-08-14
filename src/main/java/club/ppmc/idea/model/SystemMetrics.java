/**
 * SystemMetrics.java
 *
 * 一个数据传输对象 (DTO)，用于封装通过WebSocket发送到前端的实时系统监控指标。
 * 它是一个不可变的记录(record)，包含了CPU、内存、网络和时间戳信息。
 */
package club.ppmc.idea.model;

/**
 * 封装实时系统监控数据的DTO。
 *
 * @param cpuUsage      CPU 总使用率 (0.0 到 1.0 之间的小数)。
 * @param memoryUsed    已用内存 (以字节为单位)。
 * @param memoryTotal   总内存 (以字节为单位)。
 * @param networkUp     上传速率 (以字节/秒为单位)。
 * @param networkDown   下载速率 (以字节/秒为单位)。
 * @param timestamp     数据采集时的服务器时间戳 (毫秒)。
 */
public record SystemMetrics(
        double cpuUsage,
        long memoryUsed,
        long memoryTotal,
        long networkUp,
        long networkDown,
        long timestamp
) {}