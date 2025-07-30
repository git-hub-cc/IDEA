// file-node.js - 文件节点模型 (用于更结构化的文件树数据)
export class FileNode {
    // 构造函数新增 gitStatus 和 isExpanded (与后端FileNode匹配)
    constructor(name, type, path, content = '', children = [], gitStatus = 'unchanged', isExpanded = false) {
        this.name = name;
        this.type = type; // 'file' or 'folder' (匹配后端)
        this.path = path; // 完整路径，唯一标识
        this.content = content; // 文件内容 (仅文件类型有，但后端通常不传，需前端额外获取)
        this.children = children; // 子节点 (仅文件夹类型有)
        this.gitStatus = gitStatus; // 'modified', 'added', 'deleted', 'untracked', 'unchanged'
        this.isExpanded = isExpanded; // 文件夹是否展开
        this.isDirty = false; // 文件是否未保存 (前端状态)
    }

    isFolder() {
        return this.type === 'folder';
    }

    isFile() {
        return this.type === 'file';
    }

    // 递归查找文件节点
    static findNodeByPath(nodes, path) {
        for (const node of nodes) {
            // 对根节点的特殊处理：如果根节点的path是'.'，且查找的路径也是'.'，则匹配
            if (node.path === path || (node.path === '.' && path === '')) {
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

    // 递归添加文件或文件夹
    static addNode(nodes, parentPath, newNode) {
        // 如果 parentPath 是根目录的 '.' 或空字符串，则直接添加到顶层数组
        if (parentPath === '.' || parentPath === '') {
            nodes.push(newNode);
            return true;
        }

        for (const node of nodes) {
            if (node.path === parentPath && node.isFolder()) {
                node.children.push(newNode);
                node.isExpanded = true; // 添加子节点后自动展开父目录
                return true;
            }
            if (node.isFolder() && node.children && node.children.length > 0) {
                if (FileNode.addNode(node.children, parentPath, newNode)) {
                    return true;
                }
            }
        }
        return false;
    }

    // 模拟删除节点
    static deleteNode(nodes, targetPath) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].path === targetPath) {
                nodes.splice(i, 1);
                return true;
            }
            if (nodes[i].isFolder() && nodes[i].children && nodes[i].children.length > 0) {
                if (FileNode.deleteNode(nodes[i].children, targetPath)) {
                    return true;
                }
            }
        }
        return false;
    }
}