/**
 * SystemMonitorService.java
 *
 * 该服务负责周期性地采集服务器的系统资源信息（CPU、内存、网络），
 * 并通过WebSocket将这些指标实时推送到前端。
 * 它依赖于 Oshi 库进行跨平台的系统信息获取。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.SystemMetrics;
import jakarta.annotation.PostConstruct;

import java.net.SocketException;
import java.util.Arrays;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import oshi.SystemInfo;
import oshi.hardware.CentralProcessor;
import oshi.hardware.GlobalMemory;
import oshi.hardware.HardwareAbstractionLayer;
import oshi.hardware.NetworkIF;

@Service
@Slf4j
public class SystemMonitorService {

    private final WebSocketNotificationService notificationService;
    private final SystemInfo systemInfo;
    private final HardwareAbstractionLayer hardware;
    private final CentralProcessor processor;

    // 用于计算CPU使用率的状态变量
    private long[] prevTicks;

    // 用于计算网络速率的状态变量
    private long prevNetworkBytesSent;
    private long prevNetworkBytesRecv;
    private long prevTimestamp;

    public SystemMonitorService(WebSocketNotificationService notificationService) {
        this.notificationService = notificationService;
        this.systemInfo = new SystemInfo();
        this.hardware = systemInfo.getHardware();
        this.processor = hardware.getProcessor();
    }

    /**
     * 在服务启动后立即初始化状态变量。
     */
    @PostConstruct
    public void init() {
        this.prevTicks = processor.getSystemCpuLoadTicks();
        this.prevTimestamp = System.currentTimeMillis();
        this.prevNetworkBytesSent = getTotalNetworkBytes(true);
        this.prevNetworkBytesRecv = getTotalNetworkBytes(false);
        log.info("系统监控服务已初始化。");
    }

    /**
     * 定时任务，每2秒执行一次。
     * 采集所有系统指标，封装成DTO，并通过WebSocket发送。
     */
    @Scheduled(fixedRate = 2000)
    public void collectAndPushMetrics() {
        try {
            // 1. 采集CPU使用率
            double cpuLoad = processor.getSystemCpuLoadBetweenTicks(prevTicks) * 100.0;
            this.prevTicks = processor.getSystemCpuLoadTicks();

            // 2. 采集内存信息
            GlobalMemory memory = hardware.getMemory();
            long memoryTotal = memory.getTotal();
            long memoryUsed = memoryTotal - memory.getAvailable();

            // 3. 采集并计算网络速率
            long currentTimestamp = System.currentTimeMillis();
            long timeDelta = (currentTimestamp - prevTimestamp) / 1000; // 秒
            if (timeDelta == 0) timeDelta = 1; // 避免除以零

            long currentBytesSent = getTotalNetworkBytes(true);
            long currentBytesRecv = getTotalNetworkBytes(false);

            long networkUpRate = (currentBytesSent - prevNetworkBytesSent) / timeDelta;
            long networkDownRate = (currentBytesRecv - prevNetworkBytesRecv) / timeDelta;

            this.prevNetworkBytesSent = currentBytesSent;
            this.prevNetworkBytesRecv = currentBytesRecv;
            this.prevTimestamp = currentTimestamp;

            // 4. 封装并发送数据
            SystemMetrics metrics = new SystemMetrics(
                    cpuLoad,
                    memoryUsed,
                    memoryTotal,
                    networkUpRate,
                    networkDownRate,
                    currentTimestamp);

            notificationService.sendMessage("/topic/system-metrics", metrics);

        } catch (Exception e) {
            log.error("采集或推送系统监控指标时出错", e);
        }
    }

    /**
     * 辅助方法，获取所有网络接口的总发送或接收字节数。
     * @param getSent 如果为true，获取发送字节数；否则获取接收字节数。
     * @return 累计字节数。
     */
    private long getTotalNetworkBytes(boolean getSent) {
        List<NetworkIF> networkIFs = hardware.getNetworkIFs();
        return networkIFs.stream()
                .filter(net -> {
                    try {
                        return !net.queryNetworkInterface().isLoopback() && net.getBytesRecv() > 0 && net.getBytesSent() > 0;
                    } catch (SocketException e) {
                        throw new RuntimeException(e);
                    }
                })
                .mapToLong(net -> getSent ? net.getBytesSent() : net.getBytesRecv())
                .sum();
    }
}