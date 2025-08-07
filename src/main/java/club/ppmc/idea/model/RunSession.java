/**
 * RunSession.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于在内部表示一个正在运行的用户程序会话。
 * 它是一个不可变的记录(record)，聚合了与一个运行中进程相关的所有核心组件，
 * 包括进程本身、用于批量发送日志的缓冲区以及一个原子状态标志。
 * 主要由 RunSessionService 在内部创建和管理。
 */
package club.ppmc.idea.model;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 代表一个正在运行的用户程序会话。
 *
 * @param process 底层的操作系统进程对象。
 * @param logBuffer 用于暂存日志输出的线程安全的StringBuilder，以实现批量发送，提高性能。
 * @param isRunning 一个原子布尔值，用于安全地控制日志读取线程的生命周期。
 */
public record RunSession(Process process, StringBuilder logBuffer, AtomicBoolean isRunning) {}