/**
 * ContainerInfo.java
 *
 * 新增的DTO，用于封装容器列表视图所需的核心信息。
 */
package club.ppmc.idea.model.docker;

import java.util.List;

/**
 * 代表一个容器的摘要信息，用于在列表中展示。
 *
 * @param id          容器的短ID。
 * @param name        容器的名称。
 * @param image       容器所使用的镜像名称。
 * @param state       容器的当前状态 (e.g., "running", "exited")。
 * @param status      容器的状态描述 (e.g., "Up 2 hours", "Exited (0) 5 minutes ago")。
 * @param ports       端口映射信息列表。
 */
public record ContainerInfo(
        String id,
        String name,
        String image,
        String state,
        String status,
        List<String> ports
) {}