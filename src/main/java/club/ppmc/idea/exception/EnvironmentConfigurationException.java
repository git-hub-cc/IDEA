/**
 * EnvironmentConfigurationException.java
 *
 * 一个自定义的运行时异常，用于表示后端执行环境（如JDK、Maven）未正确配置。
 * 当 JavaCompilerRunnerService 在执行前进行环境校验失败时，会抛出此异常。
 * 它携带了结构化的错误信息，以便 Controller 层可以将其转换为对前端友好的响应。
 */
package club.ppmc.idea.exception;

import java.util.Map;
import lombok.Getter;

@Getter
public class EnvironmentConfigurationException extends RuntimeException {

    /** 缺失或无效的组件名称 ("jdk", "maven")。 */
    private final String missingComponent;

    /** (可选) 如果是JDK问题，这里可以指明需要的版本。 */
    private final String requiredVersion;

    /**
     * 构造函数。
     * @param message 详细的错误信息，将展示给用户。
     * @param missingComponent 问题组件的标识符 ("jdk" or "maven")。
     * @param requiredVersion (可选) 所需的版本。
     */
    public EnvironmentConfigurationException(
            String message, String missingComponent, String requiredVersion) {
        super(message);
        this.missingComponent = missingComponent;
        this.requiredVersion = requiredVersion;
    }

    /**
     * 将异常信息转换为一个Map，便于序列化为JSON。
     *
     * @return 包含结构化错误信息的Map。
     */
    public Map<String, Object> toErrorData() {
        return Map.of(
                "type", "ENVIRONMENT_ERROR",
                "message", getMessage(),
                "missing", getMissingComponent(),
                "requiredVersion", getRequiredVersion() != null ? getRequiredVersion() : ""
        );
    }
}