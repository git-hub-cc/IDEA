/**
 * ChatResponse.java
 *
 * 新增的DTO，用于封装从后端返回给前端的AI聊天响应。
 */
package club.ppmc.idea.model.ai;

/**
 * 代表从后端AI聊天接口返回的响应。
 *
 * @param aiMessage AI模型生成的回应消息。
 */
public record ChatResponse(String aiMessage) {}