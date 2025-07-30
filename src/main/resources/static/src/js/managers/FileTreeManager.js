// src/js/managers/FileTreeManager.js - 文件树管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import Config from '../config.js';
import { FileNode } from '../models/file-node.js';

const FileTreeManager = {
    container: null,
    treeData: [],
    focusedElement: null, // 用于跟踪持久选中的项

    init: function() {
        this.container = document.getElementById('file-tree');
        this.bindDOMEvents();
        this.bindAppEvents();
    },

    bindDOMEvents: function() {
        this.container.addEventListener('click', (e) => {
            const listItem = e.target.closest('li[data-path]');
            if (!listItem) return;
            this.handleNodeClick(listItem);
        });

        this.container.addEventListener('contextmenu', (e) => {
            const listItem = e.target.closest('li[data-path]');
            if (listItem) {
                e.preventDefault();
                // 右键点击时，也应该让该项获得焦点
                this.setFocus(listItem);
                const path = listItem.dataset.path;
                const type = listItem.dataset.type;
                EventBus.emit('ui:showContextMenu', { x: e.clientX, y: e.clientY, itemPath: path, itemType: type });
            }
        });
    },

    bindAppEvents: function() {
        EventBus.on('app:ready', () => this.loadProjectTree());
        EventBus.on('filesystem:changed', () => this.loadProjectTree());
    },

    loadProjectTree: async function() {
        try {
            EventBus.emit('log:info', '正在加载项目文件树...');
            const treeData = await NetworkManager.getFileTree(Config.CURRENT_PROJECT_PATH);

            // 保存状态
            const expansionState = this.getExpansionState(this.treeData);
            const previouslyFocused = this.focusedElement ? this.focusedElement.dataset.path : null;

            this.treeData = [this._transformObjectToFileNode(treeData)];
            this.render(expansionState, previouslyFocused);
            EventBus.emit('log:info', '项目文件树加载成功。');
            EventBus.emit('git:statusChanged');

            // 首次加载时，默认打开文件
            if (!this.focusedElement) {
                this.openDefaultFile();
            }
        } catch (error) {
            EventBus.emit('log:error', `加载项目树失败: ${error.message}`);
            this.container.innerHTML = `<li style="color: var(--color-error); padding: 10px;">加载项目树失败: ${error.message}</li>`;
        }
    },

    render: function(expansionState, previouslyFocusedPath) {
        this.container.innerHTML = '';
        const rootUl = document.createElement('ul');
        rootUl.className = 'file-tree';
        this.treeData.forEach(item => {
            this.renderNode(item, rootUl, expansionState);
        });
        this.container.appendChild(rootUl);

        // 恢复焦点状态
        if (previouslyFocusedPath) {
            const elementToFocus = this.container.querySelector(`li[data-path="${previouslyFocusedPath}"]`);
            if (elementToFocus) {
                this.setFocus(elementToFocus);
            }
        }
    },

    renderNode: function(node, parentElement, expansionState) {
        if (expansionState[node.path]) {
            node.isExpanded = true;
        }

        const li = document.createElement('li');
        li.dataset.path = node.path;
        li.dataset.type = node.type;
        li.className = node.type;

        if (node.isFolder() && node.isExpanded) {
            li.classList.add('expanded');
        }

        const iconClass = node.isFolder() ? 'fas fa-folder' : this.getFileIcon(node.name);
        li.innerHTML = `<i class="${iconClass}"></i><span>${node.name}</span>`;
        parentElement.appendChild(li);

        if (node.isFolder() && node.children) {
            const nestedUl = document.createElement('ul');
            node.children.forEach(child => this.renderNode(child, nestedUl, expansionState));
            li.appendChild(nestedUl);
        }
    },

    handleNodeClick: function(listItem) {
        const path = listItem.dataset.path;
        const node = FileNode.findNodeByPath(this.treeData, path);
        if (!node) return;

        // 任何点击都会让该项获得焦点
        this.setFocus(listItem);

        if (node.isFile()) {
            // 如果是文件，则打开它
            EventBus.emit('file:openRequest', path);
        } else if (node.isFolder()) {
            // 如果是文件夹，则切换展开状态
            node.isExpanded = !node.isExpanded;
            listItem.classList.toggle('expanded');
        }
    },

    /**
     * 设置某个文件/文件夹项为焦点状态
     * @param {HTMLElement} element - 要设置焦点的 li 元素
     */
    setFocus: function(element) {
        if (this.focusedElement) {
            this.focusedElement.classList.remove('focused');
        }
        element.classList.add('focused');
        this.focusedElement = element;
    },

    /**
     * 获取当前拥有焦点的项的路径和类型信息
     * @returns {{path: string, type: string}|null}
     */
    getFocusedItem: function() {
        if (this.focusedElement) {
            return {
                path: this.focusedElement.dataset.path,
                type: this.focusedElement.dataset.type
            };
        }
        return null;
    },

    getExpansionState: function(nodes, state = {}) {
        for (const node of nodes) {
            if (node.isFolder()) {
                if (node.isExpanded) {
                    state[node.path] = true;
                }
                if (node.children) {
                    this.getExpansionState(node.children, state);
                }
            }
        }
        return state;
    },

    getFileIcon: function(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            case 'java': return 'fab fa-java';
            case 'js': return 'fab fa-js';
            case 'html': return 'fab fa-html5';
            case 'css': return 'fab fa-css3-alt';
            case 'xml': case 'pom': return 'fas fa-file-code';
            case 'json': return 'fas fa-file-alt';
            case 'md': return 'fab fa-markdown';
            case 'gitignore': return 'fab fa-git-alt';
            default: return 'fas fa-file';
        }
    },

    openDefaultFile: function() {
        if (!this.treeData || this.treeData.length === 0) return;
        const findFirstJavaFile = (node) => {
            if (node.type === 'file' && node.name.endsWith('.java')) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findFirstJavaFile(child);
                    if (found) return found;
                }
            }
            return null;
        };
        const defaultFile = findFirstJavaFile(this.treeData[0]);
        if (defaultFile) {
            const element = this.container.querySelector(`li[data-path="${defaultFile.path}"]`);
            if (element) {
                this.setFocus(element);
                EventBus.emit('file:openRequest', defaultFile.path);
            }
        }
    },

    _transformObjectToFileNode: function(obj) {
        if (!obj) return null;
        const children = obj.children ? obj.children.map(child => this._transformObjectToFileNode(child)) : [];
        return new FileNode(obj.name, obj.type, obj.path, '', children, 'unchanged', false);
    }
};

export default FileTreeManager;