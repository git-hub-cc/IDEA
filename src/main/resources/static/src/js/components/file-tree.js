// file-tree.js - 文件树组件逻辑
import { FileNode } from '../models/file-node.js';

export class FileTree {
    constructor(containerId, initialData, eventBus) { // initialData 现在是空数组或后端数据
        this.container = document.getElementById(containerId);
        this.data = initialData; // FileNode[]
        this.eventBus = eventBus;
        this.selectedElement = null; // 当前选中的文件或文件夹的DOM元素
        this._listenersAttached = false; // 跟踪监听器是否已添加
    }

    // 新增方法：更新文件树数据并重新渲染
    updateData(newData) {
        // 后端返回的是普通JS对象，需要递归转换为FileNode实例
        this.data = newData.map(item => this._transformObjectToFileNode(item));
        this.render(); // 重新渲染整个树
    }

    // 辅助方法：递归将后端返回的普通JS对象转换为FileNode实例
    _transformObjectToFileNode(obj) {
        if (!obj) return null;
        const children = obj.children ? obj.children.map(child => this._transformObjectToFileNode(child)) : [];
        // 注意：obj.path 应该是后端返回的相对路径
        const node = new FileNode(obj.name, obj.type, obj.path, obj.content, children, obj.gitStatus, obj.isExpanded);
        node.isDirty = obj.isDirty || false; // 保持修改状态
        return node;
    }

    render() {
        this.container.innerHTML = ''; // 清空旧内容
        // 渲染根目录下的所有节点（即传入的 data 数组中的每个 FileNode）
        this.data.forEach(item => {
            const ul = document.createElement('ul');
            ul.className = 'file-tree';
            this.renderItem(item, ul); // 渲染每个顶级节点
            this.container.appendChild(ul); // 将每个顶级节点的ul添加到容器
        });
        this.addEventListeners(); // 确保事件监听器只添加一次
    }

    renderItem(item, parentElement) {
        const li = document.createElement('li');
        li.dataset.path = item.path;
        li.dataset.type = item.type;
        // 根节点（如'demo-project'）的path可能是'.'，这里需要特殊处理显示名称
        // if (item.path === '.' && item.name === 'workspaceRoot') {
        //     li.dataset.path = ''; // 或者设为空，取决于你想怎么处理顶级视图
        // }

        if (item.isFolder() && item.isExpanded) {
            li.classList.add('expanded');
        }

        if (item.gitStatus && item.gitStatus !== 'unchanged') { // 仅显示非unchanged状态
            const statusIndicator = document.createElement('span');
            statusIndicator.className = `git-status-indicator ${item.gitStatus}`;
            statusIndicator.title = `Git Status: ${item.gitStatus.charAt(0).toUpperCase() + item.gitStatus.slice(1)}`;
            li.appendChild(statusIndicator);
        }

        const iconClass = item.isFolder() ? 'fas fa-folder' : this.getFileIcon(item.name);
        // 对于文件夹，加入一个wrapper来控制箭头位置
        const nameSpan = document.createElement('span');
        nameSpan.className = item.isFolder() ? 'folder-name-wrapper' : 'file-name-wrapper';
        nameSpan.textContent = item.name;

        li.innerHTML = `<i class="${iconClass}"></i>`;
        li.appendChild(nameSpan);


        if (item.isFolder() && item.children) {
            li.classList.add('folder');
            const nestedUl = document.createElement('ul');
            item.children.forEach(child => this.renderItem(child, nestedUl));
            li.appendChild(nestedUl);
            if (item.isExpanded) {
                nestedUl.style.display = 'block';
            }
        } else {
            li.classList.add('file');
        }
        parentElement.appendChild(li);
    }

    getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            case 'java': return 'fab fa-java';
            case 'js': return 'fab fa-js';
            case 'ts': return 'fab fa-js'; // TypeScript
            case 'html': return 'fab fa-html5';
            case 'css': return 'fab fa-css3-alt';
            case 'xml': case 'pom': return 'fas fa-file-code'; // pom.xml, general xml
            case 'gradle': return 'fas fa-code'; // build.gradle
            case 'json': return 'fas fa-file-alt';
            case 'md': return 'fab fa-markdown';
            case 'yml': case 'yaml': return 'fas fa-file-alt'; // YAML
            case 'properties': return 'fas fa-cogs'; // Properties file
            case 'gitignore': return 'fas fa-file-alt'; // .gitignore
            case 'txt': return 'fas fa-file-lines'; // Text file
            default: return 'fas fa-file'; // 默认文件图标
        }
    }

    addEventListeners() {
        // 确保只添加一次监听器
        if (!this._listenersAttached) {
            this.container.addEventListener('click', (e) => {
                const listItem = e.target.closest('li[data-path]');
                if (!listItem) return;

                const path = listItem.dataset.path;
                const type = listItem.dataset.type;

                if (type === 'file') {
                    this.selectFile(listItem, path);
                } else if (type === 'folder') {
                    this.toggleFolder(listItem, path);
                }
            });

            this.container.addEventListener('contextmenu', (e) => {
                const listItem = e.target.closest('li[data-path]');
                if (listItem) {
                    e.preventDefault();
                    const path = listItem.dataset.path;
                    this.eventBus.emit('showContextMenu', { x: e.clientX, y: e.clientY, itemPath: path, itemType: listItem.dataset.type });
                }
            });
            this.addGlobalContextMenuListener(); // 添加全局点击来关闭右键菜单
            this._listenersAttached = true;
        }
    }

    selectFile(listItem, path) {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('selected');
        }
        listItem.classList.add('selected');
        this.selectedElement = listItem;
        this.eventBus.emit('fileOpenRequest', path);
    }

    toggleFolder(listItem, path) {
        const fileNode = FileNode.findNodeByPath(this.data, path);
        if (fileNode) {
            fileNode.isExpanded = !fileNode.isExpanded;
        }
        listItem.classList.toggle('expanded');
        const nestedUl = listItem.querySelector('ul');
        if (nestedUl) {
            nestedUl.style.display = listItem.classList.contains('expanded') ? 'block' : 'none';
        }
    }

    // 新增：添加一个全局事件监听器来处理右键菜单的关闭
    addGlobalContextMenuListener() {
        // 移除旧的，防止重复添加
        if (this._globalContextMenuListener) {
            document.removeEventListener('click', this._globalContextMenuListener);
            document.removeEventListener('contextmenu', this._globalContextMenuListener);
        }

        const closeMenu = (e) => {
            const contextMenu = document.querySelector('.context-menu');
            if (contextMenu && !contextMenu.contains(e.target)) {
                contextMenu.remove();
            }
        };
        this._globalContextMenuListener = closeMenu; // 保存引用以便后续移除

        document.addEventListener('click', this._globalContextMenuListener);
        document.addEventListener('contextmenu', this._globalContextMenuListener); // 再次右键也关闭
    }
}