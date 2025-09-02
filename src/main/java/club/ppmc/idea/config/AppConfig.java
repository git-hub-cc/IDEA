/**
 * AppConfig.java
 *
 * Spring Boot 应用的基础配置类。
 * 主要用于定义一些应用级别的Bean，例如用于进行HTTP通信的RestTemplate。
 * 新增了对Jackson ObjectMapper的定制，以解决特定的序列化问题。
 */
package club.ppmc.idea.config;

import com.fasterxml.jackson.databind.SerializationFeature;
import com.google.gson.Gson;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
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

    // ========================= 新增 START =========================
    /**
     * 定制 Spring Boot 自动配置的 Jackson ObjectMapper。
     *
     * <p><b>问题背景</b>:
     * 在调用 `docker inspect` 时，`docker-java` 库返回的 `InspectContainerResponse` 对象中，
     * `ExposedPorts` 字段的值可能是一个没有任何属性的空 `java.lang.Object` 实例。
     * Jackson 的默认行为是，当遇到无法序列化的 "empty bean" 时，会抛出
     * `InvalidDefinitionException` 异常，因为 `SerializationFeature.FAIL_ON_EMPTY_BEANS` 默认是开启的。
     * </p>
     *
     * <p><b>解决方案</b>:
     * 我们通过提供一个 `Jackson2ObjectMapperBuilderCustomizer` Bean 来修改这个默认行为。
     * `builder.failOnEmptyBeans(false)` 指示 Jackson 在遇到空 Bean 时不要失败，
     * 而是将其序列化为一个空的 JSON 对象 `{}`。这是一个全局配置，解决了 `DockerService`
     * 中的序列化问题，同时也提高了应用对类似情况的健壮性。
     * </p>
     *
     * @return 一个用于定制 Jackson ObjectMapper 的配置器。
     */
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> builder.failOnEmptyBeans(false);
    }
    // ========================= 新增 END ===========================
}