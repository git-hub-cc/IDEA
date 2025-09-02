/**
 * DockerService.java
 *
 * 新增的服务类，封装了所有与 Docker Daemon 交互的业务逻辑。
 * 它是 Docker 功能的核心，负责执行命令并将结果转换为对前端友好的 DTOs。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.docker.ContainerDetails;
import club.ppmc.idea.model.docker.ContainerInfo;
import club.ppmc.idea.model.docker.ImageInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.ContainerPort;
import com.github.dockerjava.api.model.Image;
import com.github.dockerjava.core.command.LogContainerResultCallback;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class DockerService {

    private final DockerClient dockerClient;
    private final WebSocketNotificationService notificationService;
    private final ObjectMapper objectMapper;
    private final ExecutorService executorService = Executors.newCachedThreadPool();

    public DockerService(DockerClient dockerClient, WebSocketNotificationService notificationService, ObjectMapper objectMapper) {
        this.dockerClient = dockerClient;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
    }

    /**
     * 获取所有容器（包括已停止的）的列表。
     * @return 容器信息列表。
     */
    public List<ContainerInfo> listContainers() {
        try {
            List<Container> containers = dockerClient.listContainersCmd().withShowAll(true).exec();
            return containers.stream().map(this::toContainerInfo).collect(Collectors.toList());
        } catch (Exception e) {
            log.error("获取Docker容器列表失败", e);
            return Collections.emptyList();
        }
    }

    /**
     * 获取所有本地镜像的列表。
     * @return 镜像信息列表。
     */
    public List<ImageInfo> listImages() {
        try {
            List<Image> images = dockerClient.listImagesCmd().withShowAll(true).exec();
            return images.stream().map(this::toImageInfo).collect(Collectors.toList());
        } catch (Exception e) {
            log.error("获取Docker镜像列表失败", e);
            return Collections.emptyList();
        }
    }

    public void startContainer(String containerId) {
        log.info("请求启动容器: {}", containerId);
        dockerClient.startContainerCmd(containerId).exec();
    }

    public void stopContainer(String containerId) {
        log.info("请求停止容器: {}", containerId);
        dockerClient.stopContainerCmd(containerId).exec();
    }

    public void restartContainer(String containerId) {
        log.info("请求重启容器: {}", containerId);
        dockerClient.restartContainerCmd(containerId).exec();
    }

    public void removeContainer(String containerId) {
        log.info("请求删除容器: {}", containerId);
        dockerClient.removeContainerCmd(containerId).withForce(true).exec(); // 使用 force 以删除运行中的容器
    }

    /**
     * 获取容器的详细检查信息。
     * @param containerId 容器ID。
     * @return 包含 inspect JSON 的 DTO。
     */
    public ContainerDetails inspectContainer(String containerId) {
        try {
            InspectContainerResponse response = dockerClient.inspectContainerCmd(containerId).exec();
            String inspectJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(response);
            return new ContainerDetails(inspectJson);
        } catch (JsonProcessingException e) {
            log.error("序列化容器 inspect 响应失败 for {}", containerId, e);
            return new ContainerDetails("{\"error\": \"无法序列化容器详情\"}");
        }
    }

    /**
     * 附加到容器的日志流，并通过 WebSocket 实时推送到前端。
     * @param containerId 容器ID。
     */
    public void streamLogs(String containerId) {
        executorService.submit(() -> {
            log.info("开始为容器 {} 推送日志流", containerId);
            final String topic = String.format("/topic/docker/logs/%s", containerId);
            try (LogContainerResultCallback callback = new LogContainerResultCallback() {
                @Override
                public void onNext(com.github.dockerjava.api.model.Frame item) {
                    notificationService.sendMessage(topic, item.toString());
                }
            }) {
                dockerClient.logContainerCmd(containerId)
                        .withStdOut(true)
                        .withStdErr(true)
                        .withFollowStream(true)
                        .withTailAll()
                        .exec(callback)
                        .awaitCompletion(); // 阻塞直到日志流结束
            } catch (Exception e) {
                log.warn("容器 {} 的日志流已中断或出错: {}", containerId, e.getMessage());
                notificationService.sendMessage(topic, "[INFO] 日志流已结束。");
            } finally {
                log.info("容器 {} 的日志流已停止推送", containerId);
            }
        });
    }

    // --- DTO 转换辅助方法 ---

    private ContainerInfo toContainerInfo(Container container) {
        String name = Arrays.stream(container.getNames())
                .findFirst()
                .map(n -> n.startsWith("/") ? n.substring(1) : n)
                .orElse("N/A");

        List<String> portMappings = Arrays.stream(container.getPorts())
                .map(this::formatPortMapping)
                .collect(Collectors.toList());

        return new ContainerInfo(
                container.getId().substring(0, 12),
                name,
                container.getImage(),
                container.getState(),
                container.getStatus(),
                portMappings
        );
    }

    private ImageInfo toImageInfo(Image image) {
        List<String> tags = image.getRepoTags() != null
                ? Arrays.asList(image.getRepoTags())
                : Collections.singletonList("<none>:<none>");
        return new ImageInfo(
                image.getId().replace("sha256:", "").substring(0, 12),
                tags,
                image.getSize(),
                image.getCreated()
        );
    }

    private String formatPortMapping(ContainerPort port) {
        StringBuilder sb = new StringBuilder();
        if (port.getIp() != null) {
            sb.append(port.getIp()).append(":");
        }
        if (port.getPublicPort() != null) {
            sb.append(port.getPublicPort()).append("->");
        }
        sb.append(port.getPrivatePort()).append("/").append(port.getType());
        return sb.toString();
    }
}