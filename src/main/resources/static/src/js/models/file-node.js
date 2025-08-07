// src/js/models/file-node.js - 文件节点模型

/**
 * @description 代表文件树中的一个节点（文件或文件夹）。
 * @param {string} name - 节点名称。
 * @param {string} type - 节点类型 ('file' 或 'folder')。
 * @param {string} path - 节点的完整相对路径。
 * @param {string} [content=''] - 文件内容。
 * @param {FileNode[]} [children=[]] - 子节点数组。
 * @param {string} [gitStatus='unchanged'] - Git 状态。
 * @param {boolean} [isExpanded=false] - 文件夹是否展开。
 */
export function FileNode(name, type, path, content = '', children = [], gitStatus = 'unchanged', isExpanded = false) {
    this.name = name;
    this.type = type;
    this.path = path;
    this.content = content;
    this.children = children;
    this.gitStatus = gitStatus;
    this.isExpanded = isExpanded;
    this.isDirty = false; // 前端状态，标记编辑器内容是否已修改
}

/**
 * @description 检查节点是否为文件夹。
 * @returns {boolean}
 */
FileNode.prototype.isFolder = function() {
    return this.type === 'folder';
};

/**
 * @description 检查节点是否为文件。
 * @returns {boolean}
 */
FileNode.prototype.isFile = function() {
    return this.type === 'file';
};

/**
 * @description 在节点树中根据路径查找节点。
 * @static
 * @param {FileNode[]} nodes - 要搜索的节点数组。
 * @param {string} path - 要查找的路径。
 * @returns {FileNode|null} 找到的节点或 null。
 */
FileNode.findNodeByPath = function(nodes, path) {
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
};