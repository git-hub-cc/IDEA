/**
 * Settings.java
 *
 * 该文件定义了一个POJO，用于表示和持久化IDE的各项配置。
 * 这些设置由用户通过UI修改，由 SettingsService 负责加载和保存到服务器的 .ide/settings.json 文件中。
 * 它是一个可变对象，以便于Jackson库进行序列化和反序列化。
 */
package club.ppmc.idea.model;

import java.util.HashMap;
import java.util.Map;
import lombok.Data;

@Data
public class Settings {

    // --- 环境配置 ---
    /**
     * 工作区根目录的绝对路径。所有项目都将存放在此目录下。
     * 默认值为 "./workspace"。
     */
    private String workspaceRoot = "./workspace";

    /**
     * Maven 的主目录（MAVEN_HOME），例如 "C:/tools/apache-maven-3.9.6"。
     * 用于执行 'mvn' 命令。
     */
    private String mavenHome;

    /**
     * 存储多个 JDK 版本的路径。
     * Key: JDK标识符, 如 "jdk8", "jdk11", "jdk17"。
     * Value: 对应JDK的 java.exe 或 java 可执行文件的绝对路径。
     */
    private Map<String, String> jdkPaths = new HashMap<>();

    // --- 应用外观设置 ---
    private String theme = "dark-theme";
    private int fontSize = 14;
    private String editorFontFamily = "JetBrains Mono";
    private boolean wordWrap = true;

    // --- Git 平台配置 ---
    /**
     * Git 托管平台，例如 "gitee" 或 "github"。
     * 这决定了 `GitService` 调用哪个平台的API来获取仓库列表。
     */
    private String gitPlatform = "gitee";

    /**
     * 个人访问令牌，用于API访问和HTTPS协议的Git操作。
     */
    private String giteeAccessToken;
}