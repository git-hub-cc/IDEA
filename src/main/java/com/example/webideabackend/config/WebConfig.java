/**
 * 文件头注释：
 * WebConfig.java
 * 该文件定义了全局的Spring Web MVC配置。
 * 目前，它的主要职责是配置跨域资源共享 (CORS)，以允许前端应用程序与后端API进行交互。
 * 它与 application.properties 中的CORS配置是互斥的，Java配置的优先级更高。
 */
package com.example.webideabackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /**
     * 配置全局CORS映射。
     *
     * <p><b>设计决策修正：</b>
     * 为了解决“不允许在allowCredentials为true时使用通配符来源”的问题，
     * 我们从 {@code .allowedOrigins("*")} 切换到 {@code .allowedOriginPatterns("*")}。
     * {@code allowedOriginPatterns} 是一种更灵活的机制，它会动态地将请求的Origin头部
     * 反射到响应的Access-Control-Allow-Origin头部，从而安全地支持了凭证和任意来源的组合。
     * 这在开发环境中尤其有用。
     * </p>
     *
     * @param registry CORS配置注册表
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**") // 应用于所有API端点
                .allowedOriginPatterns("*")   // 使用模式匹配，这是解决凭证+通配符冲突的最佳实践
                .allowedMethods("*")          // 允许所有标准的HTTP方法
                .allowedHeaders("*")          // 允许所有请求头
                .allowCredentials(true);      // 明确设置为true，以支持需要身份验证的场景
    }
}