/**
 * RunController.java
 *
 * 该控制器专门处理与正在运行的用户程序交互的请求。
 * 目前只提供停止当前运行程序的功能。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.service.RunSessionService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/run")
public class RunController {

    private final RunSessionService runSessionService;

    public RunController(RunSessionService runSessionService) {
        this.runSessionService = runSessionService;
    }

    /**
     * 停止当前正在运行的程序。
     */
    @PostMapping("/stop")
    public ResponseEntity<Map<String, String>> stop() {
        runSessionService.stop();
        return ResponseEntity.ok(Map.of("message", "已向正在运行的进程发送停止信号。"));
    }
}