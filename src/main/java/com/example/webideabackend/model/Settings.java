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

}