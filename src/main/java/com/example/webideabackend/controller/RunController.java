package com.example.webideabackend.controller;

import com.example.webideabackend.service.RunSessionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/run")
public class RunController {

    private final RunSessionService runSessionService;

    @Autowired
    public RunController(RunSessionService runSessionService) {
        this.runSessionService = runSessionService;
    }

    /**
     * 停止当前正在运行的程序。
     * @return 操作结果
     */
    @PostMapping("/stop")
    public ResponseEntity<?> stop() {
        runSessionService.stop();
        return ResponseEntity.ok(Map.of("message", "Stop signal sent to the running process."));
    }
}