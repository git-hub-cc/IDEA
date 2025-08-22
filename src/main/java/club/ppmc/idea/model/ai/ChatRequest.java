/**
 * ChatRequest.java
 *
 * DTO，用于封装从前端发送到后端的AI聊天请求。
 * 已修改，现在包含AI服务的配置信息。
 */
package club.ppmc.idea.model.ai;

/**
 * 代表一个发送给后端AI聊天接口的请求。
 *
 * @param userMessage 用户的聊天消息。
 * @param contextCode (可选) 用户当前编辑器中选中的代码或整个文件的代码，作为上下文。
 * @param apiKey      (新增) 从客户端获取的AI服务API密钥。
 * @param apiEndpoint (新增) 从客户端获取的AI服务API端点URL。
 * @param model       (新增) 从客户端获取的要使用的AI模型名称。
 */
public record ChatRequest(
        String userMessage,
        String contextCode,
        String apiKey,
        String apiEndpoint,
        String model
) {}