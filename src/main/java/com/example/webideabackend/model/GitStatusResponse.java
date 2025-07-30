
/**
 * GitStatusResponse.java
 *
 * 该文件定义了一个DTO，用于将Git仓库的状态信息从后端发送到前端。
 * 它包含了当前分支、文件变更计数以及详细的文件列表。
 */
package com.example.webideabackend.model;

import lombok.Builder;
import lombok.Data;
import java.util.Set;

@Data
@Builder
public class GitStatusResponse {
    private String currentBranch;
    private Set<String> modified;
    private Set<String> added;
    private Set<String> deleted;
    private Set<String> untracked;
    private Set<String> conflicting;
    private boolean isClean;

    @Data
    @Builder
    public static class Counts {
        private int modified;
        private int added;
        private int deleted;
        private int untracked;
        private int conflicting;
    }

    public Counts getCounts() {
        return Counts.builder()
                .modified(modified.size())
                .added(added.size())
                .deleted(deleted.size())
                .untracked(untracked.size())
                .conflicting(conflicting.size())
                .build();
    }
}