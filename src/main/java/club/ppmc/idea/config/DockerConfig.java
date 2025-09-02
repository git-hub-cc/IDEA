/**
 * DockerConfig.java
 *
 * 新增的配置类，专门用于创建和配置 DockerClient Bean。
 * 这样做可以集中管理 Docker 客户端的初始化逻辑，并使其可以在整个应用中被依赖注入。
 */
package club.ppmc.idea.config;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import com.github.dockerjava.transport.DockerHttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DockerConfig {

    /**
     * 创建一个全局的 DockerClient Bean。
     *
     * <p><b>设计思路</b>:
     * 1. <b>DefaultDockerClientConfig</b>: 这是 docker-java 的标准配置构建器。
     *    它会自动从系统环境变量（如 DOCKER_HOST, DOCKER_TLS_VERIFY）或标准位置
     *    （如 ~/.docker/config.json）加载 Docker daemon 的连接信息。这使得配置非常灵活，
     *    无需在 application.properties 中硬编码。
     * 2. <b>ApacheDockerHttpClient</b>: 我们选择 Apache HttpClient 5 作为底层的 HTTP 传输实现。
     *    它是一个成熟且功能丰富的 HTTP 客户端。我们还为它设置了合理的超时时间，
     *    以防止长时间无响应的 Docker API 调用阻塞应用。
     * 3. <b>DockerClientImpl</b>: 使用上述配置和 HTTP 客户端来实例化最终的 DockerClient。
     * </p>
     *
     * @return 一个配置好的、可供注入的 DockerClient 实例。
     */
    @Bean
    public DockerClient dockerClient() {
        DockerClientConfig config = DefaultDockerClientConfig.createDefaultConfigBuilder().build();

        DockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                .dockerHost(config.getDockerHost())
                .sslConfig(config.getSSLConfig())
                .maxConnections(100)
                .connectionTimeout(Duration.ofSeconds(30))
                .responseTimeout(Duration.ofSeconds(45))
                .build();

        return DockerClientImpl.getInstance(config, httpClient);
    }
}