/**
 * ImageInfo.java
 *
 * 新增的DTO，用于封装镜像列表视图所需的核心信息。
 */
package club.ppmc.idea.model.docker;

import java.util.List;

/**
 * 代表一个Docker镜像的摘要信息。
 *
 * @param id      镜像的短ID。
 * @param tags    镜像的所有标签列表。
 * @param size    镜像的大小（以字节为单位）。
 * @param created 创建时间的时间戳。
 */
public record ImageInfo(String id, List<String> tags, long size, long created) {}