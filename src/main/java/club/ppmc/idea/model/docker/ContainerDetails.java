/**
 * ContainerDetails.java
 *
 * 新增的DTO，用于封装从 `docker inspect` 命令获取的容器详细信息。
 */
package club.ppmc.idea.model.docker;

/**
 * 代表一个容器的详细检查信息。
 *
 * @param inspectJson `docker inspect` 命令返回的原始JSON字符串。
 *                    直接返回JSON字符串可以给前端最大的灵活性，
 *                    前端可以使用Monaco编辑器等工具来美化和展示这些信息。
 */
public record ContainerDetails(String inspectJson) {}