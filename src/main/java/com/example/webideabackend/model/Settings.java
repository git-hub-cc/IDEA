/**
 * Settings.java
 *
 * 该文件定义了一个POJO，用于表示和持久化IDE的配置。
 * 这些设置可以由用户通过UI进行修改，并保存在服务器上。
 */
package com.example.webideabackend.model;

import lombok.Data;

import java.util.HashMap;
import java.util.Map;

@Data
public class Settings {

    // ========================= 关键修改 START: 新增环境配置字段 =========================
    /**
     * 工作区根目录的绝对路径。
     */
    private String workspaceRoot = "./workspace"; // 提供一个默认值

    /**
     * Maven 的主目录（MAVEN_HOME），例如 "C:/tools/apache-maven-3.9.6"。
     */
    private String mavenHome;

    /**
     * 存储多个 JDK 版本的路径。
     * Key: JDK标识符, 如 "jdk8", "jdk11", "jdk17"。
     * Value: 对应JDK的 java.exe 的绝对路径。
     */
    private Map<String, String> jdkPaths = new HashMap<>();
    // ========================= 关键修改 END ========================================

    // 应用外观设置
    private String theme = "dark-theme";
    private int fontSize = 14;
    private String editorFontFamily = "JetBrains Mono";
    private boolean wordWrap = true;

    // Git 平台配置
    /**
     * Git 托管平台，例如 "gitee" 或 "github"。
     * 默认为 "gitee" 以保持向后兼容。
     */
    private String gitPlatform = "gitee";

    /**
     * 个人访问令牌，用于API访问和HTTPS操作。
     */
    private String giteeAccessToken;

    /**
     * 用于SSH操作的私钥文件的绝对路径。
     */
    private String giteeSshPrivateKeyPath;

    /**
     * SSH私钥的密码（如果已设置）。
     */
    private String giteeSshPassphrase;
}