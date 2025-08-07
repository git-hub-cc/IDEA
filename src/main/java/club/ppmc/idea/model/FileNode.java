/**
 * FileNode.java
 *
 * 该文件定义了一个普通的Java对象 (POJO)，用于表示文件系统树中的一个节点（文件或目录）。
 * 与其他DTO不同，此类被特意设计为可变的（mutable），因为它需要持有和更新UI相关的状态，
 * 如 `isExpanded` 和 `isDirty`，而无需重新创建整个文件树。
 * 它由 FileService 构建，并由 FileController 返回给前端。
 */
package club.ppmc.idea.model;

import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class FileNode {

    /** 节点名称 (文件名或目录名) */
    private String name;

    /** 节点相对于项目根目录的完整路径 */
    private String path;

    /** 节点类型: "file" 或 "folder" */
    private String type;

    /** 文件大小（以字节为单位），目录此项为0 */
    private Long size;

    /** 最后修改时间的时间戳 */
    private Long lastModified;

    /** 子节点列表，仅当类型为 "folder" 时有效 */
    private List<FileNode> children;

    /** UI状态：在文件树中，该文件夹节点是否已展开 */
    private boolean isExpanded;

    /** UI状态：在编辑器中，该文件是否已被修改但尚未保存 */
    private boolean isDirty;
}