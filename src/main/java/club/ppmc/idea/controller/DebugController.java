/**
 * DebugController.java
 *
 * 该控制器负责处理所有与调试功能相关的HTTP请求。
 * 它作为前端UI和后端 DebugService 之间的桥梁，将用户的操作（如启动调试、设置断点、单步执行）
 * 转换为对 DebugService 的调用。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.model.debug.BreakpointRequest;
import club.ppmc.idea.model.debug.DebugRequest;
import club.ppmc.idea.service.DebugService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/debug")
public class DebugController {

    private final DebugService debugService;

    public DebugController(DebugService debugService) {
        this.debugService = debugService;
    }

    /**
     * 启动一个调试会话。
     *
     * @param request 包含项目路径和主类名的请求体。
     * @return 启动结果的响应。
     */
    @PostMapping("/start")
    public ResponseEntity<?> start(@RequestBody DebugRequest request) {
        try {
            if (request.projectPath() == null || request.projectPath().isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("message", "项目路径 (projectPath) 不能为空"));
            }
            if (request.mainClass() == null || request.mainClass().isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("message", "主类 (mainClass) 不能为空"));
            }

            debugService.startDebug(request.projectPath(), request.mainClass());
            return ResponseEntity.ok(Map.of("message", "调试会话启动中..."));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "启动调试失败: " + e.getMessage()));
        }
    }

    /**
     * 停止当前的调试会话。
     */
    @PostMapping("/stop")
    public ResponseEntity<Map<String, String>> stop() {
        debugService.stopDebug();
        return ResponseEntity.ok(Map.of("message", "调试会话已停止。"));
    }

    /**
     * 切换（设置或移除）一个断点。
     *
     * @param request 包含文件路径、行号和启用状态的请求体。
     */
    @PostMapping("/breakpoint/toggle")
    public ResponseEntity<Void> toggleBreakpoint(@RequestBody BreakpointRequest request) {
        debugService.toggleBreakpoint(request.filePath(), request.lineNumber(), request.enabled());
        return ResponseEntity.ok().build();
    }

    /**
     * 执行"步过"（Step Over）操作。
     */
    @PostMapping("/stepOver")
    public ResponseEntity<Void> stepOver() {
        debugService.stepOver();
        return ResponseEntity.ok().build();
    }

    /**
     * 执行"步入"（Step Into）操作。
     */
    @PostMapping("/stepInto")
    public ResponseEntity<Void> stepInto() {
        debugService.stepInto();
        return ResponseEntity.ok().build();
    }

    /**
     * 执行"步出"（Step Out）操作。
     */
    @PostMapping("/stepOut")
    public ResponseEntity<Void> stepOut() {
        debugService.stepOut();
        return ResponseEntity.ok().build();
    }

    /**
     * 恢复程序执行（Resume）。
     */
    @PostMapping("/resume")
    public ResponseEntity<Void> resume() {
        debugService.resumeDebug();
        return ResponseEntity.ok().build();
    }
}