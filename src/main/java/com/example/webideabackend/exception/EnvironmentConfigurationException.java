/**
 * EnvironmentConfigurationException.java
 *
 * 一个自定义的运行时异常，用于表示后端执行环境（如JDK、Maven）未正确配置。
 */
package com.example.webideabackend.exception;

import lombok.Getter;

@Getter
public class EnvironmentConfigurationException extends RuntimeException {

    /**
     * 缺失或无效的组件名称 ("jdk", "maven")。
     */
    private final String missingComponent;

    /**
     * (可选) 如果是JDK问题，这里可以指明需要的版本。
     */
    private final String requiredVersion;

    /**
     * 构造函数。
     * @param message 详细的错误信息，将展示给用户。
     * @param missingComponent 问题组件的标识符 ("jdk" or "maven")。
     * @param requiredVersion (可选) 所需的版本。
     */
    public EnvironmentConfigurationException(String message, String missingComponent, String requiredVersion) {
        super(message);
        this.missingComponent = missingComponent;
        this.requiredVersion = requiredVersion;
    }

    public EnvironmentConfigurationException(String message, String missingComponent) {
        this(message, missingComponent, null);
    }
}