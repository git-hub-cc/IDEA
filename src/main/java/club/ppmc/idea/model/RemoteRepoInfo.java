/**
 * RemoteRepoInfo.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于表示从远程Git托管平台（如Gitee、GitHub）获取的仓库基本信息。
 * 它是一个不可变的记录(record)，由 GitService 在调用外部API后创建，并通过 GitController 返回给前端，
 * 用于在UI上展示可供克隆的仓库列表。
 */
package club.ppmc.idea.model;

/**
 * 封装了远程Git仓库基本信息的记录。
 *
 * @param name 仓库的名称。
 * @param description 仓库的简短描述。
 * @param cloneUrl 用于克隆该仓库的HTTPS URL。
 */
public record RemoteRepoInfo(String name, String description, String cloneUrl) {}