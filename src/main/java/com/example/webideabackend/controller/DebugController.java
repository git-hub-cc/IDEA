package com.example.webideabackend.controller;

import com.example.webideabackend.model.debug.BreakpointRequest;
import com.example.webideabackend.model.debug.DebugRequest;
import com.example.webideabackend.service.DebugService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/debug")
public class DebugController {

    private final DebugService debugService;

    public DebugController(DebugService debugService) {
        this.debugService = debugService;
    }

    /**
     * 启动一个调试会话。
     * @param request 包含项目路径和主类名的请求体。
     * @return 启动结果。
     */
    @PostMapping("/start")
    public ResponseEntity<?> start(@RequestBody DebugRequest request) {
        try {
            // 从请求体中获取 projectPath 和 mainClass
            if (request.getProjectPath() == null || request.getProjectPath().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("message", "项目路径 (projectPath) 不能为空"));
            }
            if (request.getMainClass() == null || request.getMainClass().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("message", "主类 (mainClass) 不能为空"));
            }

            debugService.startDebug(request.getProjectPath(), request.getMainClass());
            return ResponseEntity.ok(Map.of("message", "调试会话启动中..."));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("message", "启动调试失败: " + e.getMessage()));
        }
    }

    /**
     * 停止当前的调试会话。
     */
    @PostMapping("/stop")
    public ResponseEntity<?> stop() {
        debugService.stopDebug();
        return ResponseEntity.ok(Map.of("message", "调试会话已停止。"));
    }

    /**
     * 切换断点。
     * @param request 包含文件路径、行号和启用状态的请求体。
     */
    @PostMapping("/breakpoint/toggle")
    public ResponseEntity<?> toggleBreakpoint(@RequestBody BreakpointRequest request) {
        debugService.toggleBreakpoint(request.getFilePath(), request.getLineNumber(), request.isEnabled());
        return ResponseEntity.ok().build();
    }

    /**
     * 执行"步过"操作。
     */
    @PostMapping("/stepOver")
    public ResponseEntity<?> stepOver() {
        debugService.stepOver();
        return ResponseEntity.ok().build();
    }

    /**
     * 执行"步入"操作。
     */
    @PostMapping("/stepInto")
    public ResponseEntity<?> stepInto() {
        debugService.stepInto();
        return ResponseEntity.ok().build();
    }

    /**
     * 执行"步出"操作。
     */
    @PostMapping("/stepOut")
    public ResponseEntity<?> stepOut() {
        debugService.stepOut();
        return ResponseEntity.ok().build();
    }

    /**
     * 恢复程序执行。
     */
    @PostMapping("/resume")
    public ResponseEntity<?> resume() {
        debugService.resumeDebug();
        return ResponseEntity.ok().build();
    }
}