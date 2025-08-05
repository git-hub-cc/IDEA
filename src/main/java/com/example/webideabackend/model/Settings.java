/**
 * Settings.java
 *
 * 该文件定义了一个POJO，用于表示和持久化IDE的配置。
 * 这些设置可以由用户通过UI进行修改，并保存在服务器上。
 */
package com.example.webideabackend.model;

import lombok.Data;

@Data
public class Settings {

    // 默认值
    private String theme = "dark-theme";
    private int fontSize = 14;
    private String editorFontFamily = "JetBrains Mono";
    private boolean wordWrap = true;

    // ========================= 关键修改 START =========================
    /**
     * Git 托管平台，例如 "gitee" 或 "github"。
     * 默认为 "gitee" 以保持向后兼容。
     */
    private String gitPlatform = "gitee";

    /**
     * 个人访问令牌，用于API访问和HTTPS操作。
     */
    private String giteeAccessToken; // 字段名保持不变以兼容旧数据，但UI上标签会改变

    /**
     * 用于SSH操作的私钥文件的绝对路径。
     */
    private String giteeSshPrivateKeyPath;

    /**
     * SSH私钥的密码（如果已设置）。
     */
    private String giteeSshPassphrase;
    // ========================= 关键修改 END ===========================
}