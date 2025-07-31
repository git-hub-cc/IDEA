/**
 * DebugController.java
 *
 * This RESTful controller handles starting, stopping, and stepping through
 * a debug session. It delegates all requests to the DebugService.
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

    /**
     * Starts a new debug session for a specific project.
     * @param projectPath The name of the project to debug.
     * @param mainClass The fully qualified name of the main class to run.
     * @return A response entity indicating the result.
     */
    @PostMapping("/start")
    public ResponseEntity<String> startDebug(
            @RequestParam String projectPath, // 关键修改: 接收项目路径
            @RequestParam String mainClass) {
        try {
            debugService.startDebugSession(projectPath, mainClass);
            return ResponseEntity.ok("Debug session started.");
        } catch (IOException | IllegalConnectorArgumentsException | IllegalStateException e) {
            return ResponseEntity.internalServerError().body("Failed to start debug session: " + e.getMessage());
        }
    }

    /**
     * Stops the currently active debug session.
     * @return A response entity.
     */
    @PostMapping("/stop")
    public ResponseEntity<String> stopDebug() {
        debugService.cleanupSession();
        return ResponseEntity.ok("Debug session stopped.");
    }

    /**
     * Resumes the execution of the debuggee.
     * @return A response entity.
     */
    @PostMapping("/resume")
    public ResponseEntity<String> resume() {
        debugService.resume();
        return ResponseEntity.ok("Resume command sent.");
    }

    /**
     * Performs a 'step over' operation.
     * @return A response entity.
     */
    @PostMapping("/stepOver")
    public ResponseEntity<String> stepOver() {
        debugService.stepOver();
        return ResponseEntity.ok("Step Over command sent.");
    }

    /**
     * Performs a 'step into' operation.
     * @return A response entity.
     */
    @PostMapping("/stepInto")
    public ResponseEntity<String> stepInto() {
        debugService.stepInto();
        return ResponseEntity.ok("Step Into command sent.");
    }

    /**
     * Performs a 'step out' operation.
     * @return A response entity.
     */
    @PostMapping("/stepOut")
    public ResponseEntity<String> stepOut() {
        debugService.stepOut();
        return ResponseEntity.ok("Step Out command sent.");
    }

    /**
     * Toggles a breakpoint. The Breakpoint DTO now includes the project path.
     * @param breakpoint The breakpoint information.
     * @return A response entity.
     */
    @PostMapping("/breakpoint/toggle")
    public ResponseEntity<String> toggleBreakpoint(@RequestBody Breakpoint breakpoint) { // 关键修改: Breakpoint DTO 自身已包含 projectPath
        try {
            debugService.toggleBreakpoint(breakpoint);
            return ResponseEntity.ok("Breakpoint toggled.");
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to toggle breakpoint: " + e.getMessage());
        }
    }
}