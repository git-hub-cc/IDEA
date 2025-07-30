/**
 * 文件头注释：
 * FileNode.java
 * 该文件定义了用于表示文件系统中文件或目录的模型。
 * 它被 FileService 用来构建文件树，并由 FileController 返回给前端。
 * 此类特意未使用 record，因为它包含可变状态（isDirty, isExpanded），以便前端状态变更时可以直接修改对象。
 */
package com.example.webideabackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FileNode {

    private String name;
    private String path; // 相对于工作区根目录的完整路径
    private String type; // "file" 或 "folder"
    private Long size; // 字节大小
    private Long lastModified; // 时间戳
    private List<FileNode> children; // 子节点列表，仅当类型为 "folder" 时有效

    /*
     * 设计决策注释：
     * 以下字段是可变状态，用于跟踪UI交互。
     * 例如，用户在前端展开一个文件夹或修改一个文件，这些状态会发生改变。
     * 因为这些字段需要被修改，所以 FileNode 被设计为一个传统的Java类(POJO)而不是一个不可变的`record`。
     * 如果使用`record`，每次状态变更都需要创建一个新的FileNode实例，这对于UI状态管理来说过于繁琐。
     */
    private boolean isExpanded; // 前端状态：文件夹是否展开
    private boolean isDirty;    // 前端状态：文件内容是否被修改但未保存
}