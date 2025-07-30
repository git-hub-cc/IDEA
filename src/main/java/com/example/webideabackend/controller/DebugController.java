/**
 * DebugController.java
 *
 * 该RESTful控制器用于处理调试会话的启动、停止和单步操作。
 * 它将所有请求委托给DebugService来执行真正的调试操作。
 */
package com.example.webideabackend.controller;

import com.example.webideabackend.model.Breakpoint;
import com.example.webideabackend.service.DebugService;
import com.sun.jdi.connect.IllegalConnectorArgumentsException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/debug")
public class DebugController {

    private final DebugService debugService;

    @Autowired
    public DebugController(DebugService debugService) {
        this.debugService = debugService;
    }

    @PostMapping("/start")
    public ResponseEntity<String> startDebug(@RequestParam String projectPath, @RequestParam String mainClass) {
        try {
            debugService.startDebugSession(projectPath, mainClass);
            return ResponseEntity.ok("Debug session started.");
        } catch (IOException | IllegalConnectorArgumentsException | IllegalStateException e) {
            return ResponseEntity.internalServerError().body("Failed to start debug session: " + e.getMessage());
        }
    }

    @PostMapping("/stop")
    public ResponseEntity<String> stopDebug() {
        debugService.cleanupSession();
        return ResponseEntity.ok("Debug session stopped.");
    }

    @PostMapping("/resume")
    public ResponseEntity<String> resume() {
        debugService.resume();
        return ResponseEntity.ok("Resume command sent.");
    }

    @PostMapping("/stepOver")
    public ResponseEntity<String> stepOver() {
        debugService.stepOver();
        return ResponseEntity.ok("Step Over command sent.");
    }

    @PostMapping("/stepInto")
    public ResponseEntity<String> stepInto() {
        debugService.stepInto();
        return ResponseEntity.ok("Step Into command sent.");
    }

    @PostMapping("/stepOut")
    public ResponseEntity<String> stepOut() {
        debugService.stepOut();
        return ResponseEntity.ok("Step Out command sent.");
    }

    @PostMapping("/breakpoint/toggle")
    public ResponseEntity<String> toggleBreakpoint(@RequestBody Breakpoint breakpoint) {
        try {
            debugService.toggleBreakpoint(breakpoint);
            return ResponseEntity.ok("Breakpoint toggled.");
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to toggle breakpoint: " + e.getMessage());
        }
    }
}