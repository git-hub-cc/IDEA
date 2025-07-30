/**
 * LanguageServerController.java
 *
 * 该REST控制器为需要请求-响应交互的语言服务器功能提供API端点，
 * 例如代码补全。
 */
package com.example.webideabackend.controller;

import com.example.webideabackend.service.LanguageServerService;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionList;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/language")
@Slf4j
public class LanguageServerController {

    private final LanguageServerService languageServerService;

    @Autowired
    public LanguageServerController(LanguageServerService languageServerService) {
        this.languageServerService = languageServerService;
    }

    @PostMapping("/completion")
    public CompletableFuture<ResponseEntity<List<CompletionItem>>> getCompletions(@RequestBody Map<String, Object> payload) {
        try {
            String filePath = (String) payload.get("filePath");
            int line = (Integer) payload.get("line") - 1;       // Monaco(1-based) to LSP(0-based)
            int character = (Integer) payload.get("character") - 1; // Monaco(1-based) to LSP(0-based)

            if (filePath == null) {
                return CompletableFuture.completedFuture(ResponseEntity.badRequest().body(null));
            }

            return languageServerService.requestCompletion(filePath, line, character)
                    .thenApply(this::toCompletionItemsResponseEntity) // 使用辅助方法转换
                    .exceptionally(ex -> {
                        log.error("Failed to get code completion", ex);
                        return ResponseEntity.internalServerError().body(null);
                    });

        } catch (Exception e) {
            log.error("Invalid payload for completion request", e);
            return CompletableFuture.completedFuture(ResponseEntity.badRequest().body(null));
        }
    }

    /**
     * 辅助方法，将LSP的 `Either` 类型安全地转换为 `ResponseEntity`。
     *
     * @param result LSP返回的Either对象。
     * @return 包含CompletionItem列表的ResponseEntity。
     */
    private ResponseEntity<List<CompletionItem>> toCompletionItemsResponseEntity(Either<List<CompletionItem>, CompletionList> result) {
        if (result == null) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        if (result.isLeft()) {
            return ResponseEntity.ok(result.getLeft());
        } else {
            return ResponseEntity.ok(result.getRight().getItems());
        }
    }
}