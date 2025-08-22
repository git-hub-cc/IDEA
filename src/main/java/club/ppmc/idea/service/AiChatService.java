/**
 * AiChatService.java
 *
 * 封装与外部AI模型（如OpenAI GPT）API交互的所有逻辑。
 * 已修改，现在作为代理，使用客户端提供的配置来调用外部API。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.ai.ChatRequest;
import club.ppmc.idea.model.ai.ChatResponse;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

@Service
@Slf4j
public class AiChatService {

    private final RestTemplate restTemplate;
    // SettingsService 依赖已移除，因为不再需要从服务器配置中读取AI设置

    public AiChatService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /**
     * 处理聊天请求，使用请求中提供的配置调用外部AI API并返回结果。
     *
     * @param request 前端发来的聊天请求，现在包含配置信息。
     * @return 包含AI响应的ChatResponse。
     * @throws IllegalStateException 如果请求中缺少必要的AI配置信息。
     */
    public ChatResponse getChatCompletion(ChatRequest request) {
        // ========================= 修改 START =========================
        // 从请求体中直接获取配置，而不是从SettingsService
        String apiKey = request.apiKey();
        String apiEndpoint = request.apiEndpoint();
        String model = request.model();

        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalStateException("AI API密钥未在请求中提供。请在设置中配置。");
        }
        if (!StringUtils.hasText(apiEndpoint) || !StringUtils.hasText(model)) {
            throw new IllegalStateException("AI API端点或模型未在请求中提供。");
        }
        // ========================= 修改 END ===========================

        // 构建请求头
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        // 构建系统和用户消息
        String systemPrompt = "You are a helpful AI assistant integrated into a web-based IDE. " +
                "Provide concise, code-focused answers. Format code blocks using markdown (```java ... ```).";
        String userMessageContent = buildUserMessage(request);

        // 构建符合OpenAI API格式的请求体
        var apiRequest = new OpenAIChatRequest(
                model,
                List.of(
                        new OpenAIMessage("system", systemPrompt),
                        new OpenAIMessage("user", userMessageContent)
                )
        );

        HttpEntity<OpenAIChatRequest> entity = new HttpEntity<>(apiRequest, headers);

        // 发送请求并获取响应
        log.info("正在向 {} 发送AI聊天请求...", apiEndpoint);
        OpenAIChatResponse apiResponse = restTemplate.postForObject(apiEndpoint, entity, OpenAIChatResponse.class);

        if (apiResponse == null || apiResponse.choices() == null || apiResponse.choices().isEmpty()) {
            log.error("从AI服务收到了无效或空的响应。");
            return new ChatResponse("抱歉，从AI服务收到了空的响应。");
        }

        String aiMessage = apiResponse.choices().get(0).message().content();
        return new ChatResponse(aiMessage);
    }

    /**
     * 根据请求内容构建最终的用户消息字符串。
     */
    private String buildUserMessage(ChatRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append(request.userMessage());
        if (StringUtils.hasText(request.contextCode())) {
            sb.append("\n\n--- Code Context ---\n");
            sb.append(request.contextCode());
            sb.append("\n--- End of Code Context ---");
        }
        return sb.toString();
    }

    // --- 内部 DTOs，用于序列化/反序列化与OpenAI API的交互 ---

    private record OpenAIChatRequest(String model, List<OpenAIMessage> messages) {}
    private record OpenAIMessage(String role, String content) {}

    private record OpenAIChatResponse(List<Choice> choices) {}
    private record Choice(@JsonProperty("message") OpenAIMessage message) {}
}