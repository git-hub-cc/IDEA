/**
 * DockerController.java
 *
 * 新增的控制器，处理所有与 Docker 相关的 HTTP 请求。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.model.docker.ContainerDetails;
import club.ppmc.idea.model.docker.ContainerInfo;
import club.ppmc.idea.model.docker.ImageInfo;
import club.ppmc.idea.service.DockerService;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/docker")
@Slf4j
public class DockerController {

    private final DockerService dockerService;

    public DockerController(DockerService dockerService) {
        this.dockerService = dockerService;
    }

    @GetMapping("/containers")
    public ResponseEntity<List<ContainerInfo>> listContainers() {
        return ResponseEntity.ok(dockerService.listContainers());
    }

    @GetMapping("/images")
    public ResponseEntity<List<ImageInfo>> listImages() {
        return ResponseEntity.ok(dockerService.listImages());
    }

    @PostMapping("/containers/{id}/start")
    public ResponseEntity<?> startContainer(@PathVariable String id) {
        try {
            dockerService.startContainer(id);
            return ResponseEntity.ok(Map.of("message", "容器启动命令已发送。"));
        } catch (Exception e) {
            log.error("启动容器 {} 失败", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/containers/{id}/stop")
    public ResponseEntity<?> stopContainer(@PathVariable String id) {
        try {
            dockerService.stopContainer(id);
            return ResponseEntity.ok(Map.of("message", "容器停止命令已发送。"));
        } catch (Exception e) {
            log.error("停止容器 {} 失败", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/containers/{id}/restart")
    public ResponseEntity<?> restartContainer(@PathVariable String id) {
        try {
            dockerService.restartContainer(id);
            return ResponseEntity.ok(Map.of("message", "容器重启命令已发送。"));
        } catch (Exception e) {
            log.error("重启容器 {} 失败", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/containers/{id}")
    public ResponseEntity<?> removeContainer(@PathVariable String id) {
        try {
            dockerService.removeContainer(id);
            return ResponseEntity.ok(Map.of("message", "容器删除命令已发送。"));
        } catch (Exception e) {
            log.error("删除容器 {} 失败", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/containers/{id}/inspect")
    public ResponseEntity<ContainerDetails> inspectContainer(@PathVariable String id) {
        return ResponseEntity.ok(dockerService.inspectContainer(id));
    }

    /**
     * 此端点用于 *触发* 后端开始通过 WebSocket 推送日志。
     * 它本身不返回日志内容，只是一个启动信号。
     */
    @PostMapping("/containers/{id}/logs/attach")
    public ResponseEntity<?> attachToLogs(@PathVariable String id) {
        dockerService.streamLogs(id);
        return ResponseEntity.accepted().body(Map.of("message", "已附加到日志流。日志将通过 WebSocket 推送。"));
    }
}