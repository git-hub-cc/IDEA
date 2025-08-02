package com.example.webideabackend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GiteeRepoInfo(
        String name,
        String description,
        // ========================= 关键修正 START =========================
        // 将字段名从 sshUrl 修改为 cloneUrl，以匹配 GitService 中构造的逻辑。
        // @JsonProperty 注解现在可以省略，Jackson会默认使用字段名 "cloneUrl"。
        String cloneUrl
        // ========================= 关键修正 END ===========================
) {}