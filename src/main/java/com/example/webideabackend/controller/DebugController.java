package com.example.webideabackend.controller;

import com.example.webideabackend.service.WebSocketLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Random;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/debug")
public class DebugController {

    private final WebSocketLogService logService;
    private ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
    private boolean debugging = false;

    @Autowired
    public DebugController(WebSocketLogService logService) {
        this.logService = logService;
    }

    @PostMapping("/start")
    public ResponseEntity<String> startDebug(@RequestParam String projectPath, @RequestParam String mainClass) {
        if (debugging) {
            return ResponseEntity.badRequest().body("Debugging already in progress.");
        }
        debugging = true;
        logService.sendMessage("/topic/debug-events", "DEBUG: Debugging session started for " + mainClass + " in " + projectPath);

        // Simulate debug events
        scheduler = Executors.newScheduledThreadPool(1);
        scheduler.scheduleAtFixedRate(() -> {
            if (!debugging) {
                scheduler.shutdown();
                return;
            }
            Random rand = new Random();
            int line = rand.nextInt(100) + 1; // Simulate random line number
            String currentMethod = "method" + (rand.nextInt(3) + 1);

            logService.sendMessage("/topic/debug-events", "DEBUG: Paused at " + mainClass + "." + currentMethod + "(" + line + ")");
            logService.sendMessage("/topic/debug-events", "VARIABLES: {\"counter\": " + rand.nextInt(10) + ", \"name\": \"Value" + rand.nextInt(5) + "\"}");
            logService.sendMessage("/topic/debug-events", "CALLSTACK: [\"" + mainClass + ".main()\", \"" + mainClass + "." + currentMethod + "()\"]");

        }, 0, 3, TimeUnit.SECONDS); // Every 3 seconds send a debug event

        return ResponseEntity.ok("Debug started (simulated).");
    }

    @PostMapping("/stop")
    public ResponseEntity<String> stopDebug() {
        if (!debugging) {
            return ResponseEntity.badRequest().body("No debugging session active.");
        }
        debugging = false;
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdownNow();
        }
        logService.sendMessage("/topic/debug-events", "DEBUG: Debugging session stopped.");
        return ResponseEntity.ok("Debug stopped (simulated).");
    }

    @PostMapping("/stepOver")
    public ResponseEntity<String> stepOver() {
        logService.sendMessage("/topic/debug-events", "DEBUG: Stepping over...");
        return ResponseEntity.ok("Step Over (simulated)");
    }

    @PostMapping("/stepInto")
    public ResponseEntity<String> stepInto() {
        logService.sendMessage("/topic/debug-events", "DEBUG: Stepping into...");
        return ResponseEntity.ok("Step Into (simulated)");
    }

    @PostMapping("/resume")
    public ResponseEntity<String> resume() {
        logService.sendMessage("/topic/debug-events", "DEBUG: Resuming program...");
        return ResponseEntity.ok("Resume (simulated)");
    }

    // You can add more simulated debug actions like setBreakpoint, getVariables, etc.
}