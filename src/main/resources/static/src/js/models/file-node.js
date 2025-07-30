// src/js/models/file-node.js - 文件节点模型

export class FileNode {
    constructor(name, type, path, content = '', children = [], gitStatus = 'unchanged', isExpanded = false) {
        this.name = name;
        this.type = type; // 'file' or 'folder'
        this.path = path; // 完整路径
        this.content = content;
        this.children = children;
        this.gitStatus = gitStatus;
        this.isExpanded = isExpanded;
        this.isDirty = false; // 前端状态
    }

    isFolder() {
        return this.type === 'folder';
    }

    isFile() {
        return this.type === 'file';
    }

    // 静态辅助方法，用于在节点树中查找、添加、删除节点
    static findNodeByPath(nodes, path) {
        for (const node of nodes) {
            if (node.path === path) {
                return node;
            }
            if (node.isFolder() && node.children && node.children.length > 0) {
                const found = FileNode.findNodeByPath(node.children, path);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }
}