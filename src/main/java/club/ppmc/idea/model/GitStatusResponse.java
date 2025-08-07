/**
 * GitStatusResponse.java
 *
 * 该文件定义了一个DTO，用于将Git仓库的状态信息从后端的 GitService 聚合后发送到前端。
 * 它使用Lombok的 @Builder 注解，提供了链式调用的构建方式，使对象创建更清晰。
 * 包含了当前分支、详细的文件变更列表以及各类变更的计数。
 */
package club.ppmc.idea.model;

import java.util.Set;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class GitStatusResponse {

    private String currentBranch;
    private boolean isClean;
    private Set<String> modified;
    private Set<String> added;
    private Set<String> deleted;
    private Set<String> untracked;
    private Set<String> conflicting;

    /**
     * 一个内部静态类，用于提供各类变更的计数。
     * 这样设计可以避免在顶层暴露过多字段，使主对象更关注文件列表。
     */
    @Data
    @Builder
    public static class Counts {
        private int modified;
        private int added;
        private int deleted;
        private int untracked;
        private int conflicting;
    }

    /**
     * 动态计算并返回各类文件变更的计数。
     *
     * @return 一个包含所有计数的 Counts 对象。
     */
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