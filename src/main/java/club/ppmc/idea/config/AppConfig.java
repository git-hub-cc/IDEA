/**
 * AppConfig.java
 *
 * Spring Boot 应用的基础配置类。
 * 主要用于定义一些应用级别的Bean，例如用于进行HTTP通信的RestTemplate。
 */
package club.ppmc.idea.config;

import com.google.gson.Gson;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AppConfig {

    /**
     * 定义一个全局的 RestTemplate Bean。
     * RestTemplate 是 Spring 提供的用于执行同步HTTP请求的客户端。
     *
     * @return 一个新的 RestTemplate 实例。
     */
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    /**
     * 定义一个全局的 Gson Bean。
     * Gson 是 Google 提供的用于处理 JSON 序列化和反序列化的库。
     * 在WebSocket服务中用于将事件对象转换为JSON字符串，确保与前端的兼容性。
     *
     * @return 一个新的 Gson 实例。
     */
    @Bean
    public Gson gson() {
        return new Gson();
    }
}