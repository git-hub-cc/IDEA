/**
 * AiChatController.java
 *
 * 新增的控制器，专门处理与AI聊天功能相关的HTTP请求。
 * 它作为前端UI和后端AiChatService之间的接口。
 */
package club.ppmc.idea.controller;

import club.ppmc.idea.model.ai.ChatRequest;
import club.ppmc.idea.model.ai.ChatResponse;
import club.ppmc.idea.service.AiChatService;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;

@RestController
@RequestMapping("/api/ai")
@Slf4j
public class AiChatController {

    private final AiChatService aiChatService;

    public AiChatController(AiChatService aiChatService) {
        this.aiChatService = aiChatService;
    }

    /**
     * 接收前端的聊天请求，并返回AI的响应。
     *
     * @param request 包含用户消息和可选上下文的请求体。
     * @return 包含AI生成消息的响应，或在发生错误时返回错误信息。
     */
    @PostMapping("/chat")
    public ResponseEntity<?> getChatCompletion(@RequestBody ChatRequest request) {
        try {
            ChatResponse response = aiChatService.getChatCompletion(request);
            return ResponseEntity.ok(response);
        } catch (IllegalStateException e) {
            // 捕获配置问题，如未设置API密钥
            log.warn("AI聊天请求失败，因为配置不完整: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (HttpClientErrorException e) {
            // 捕获来自外部API的HTTP错误 (如 401, 429)
            log.error("调用AI服务时发生HTTP客户端错误: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", "与AI服务通信时出错: " + e.getResponseBodyAsString()));
        } catch (Exception e) {
            // 捕获其他所有未知错误
            log.error("处理AI聊天请求时发生未知错误", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "处理请求时发生内部服务器错误。"));
        }
    }
}