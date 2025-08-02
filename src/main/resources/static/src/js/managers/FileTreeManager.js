// src/js/managers/FileTreeManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import Config from '../config.js';
import { FileNode } from '../models/file-node.js';

const FileTreeManager = {
    container: null,
    treeData: [],
    focusedElement: null,

    init: function() {
        this.container = document.getElementById('file-tree');
        this.bindDOMEvents();
        this.bindAppEvents();
    },

    bindDOMEvents: function() {
        // 使用事件委托，因为欢迎界面的按钮是动态添加的
        this.container.addEventListener('click', (e) => {
            const listItem = e.target.closest('li[data-path]');
            if (listItem) {
                this.handleNodeClick(listItem);
                return;
            }

            const actionBtn = e.target.closest('.welcome-action-btn');
            if(actionBtn) {
                const action = actionBtn.dataset.action;
                EventBus.emit(`action:${action}`);
            }
        });

        this.container.addEventListener('contextmenu', (e) => {
            const listItem = e.target.closest('li[data-path]');
            if (listItem) {
                e.preventDefault();
                this.setFocus(listItem);
                const path = listItem.dataset.path;
                const type = listItem.dataset.type;
                EventBus.emit('ui:showContextMenu', { x: e.clientX, y: e.clientY, itemPath: path, itemType: type });
            }
        });

        this.container.addEventListener('dragover', this._handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.container.addEventListener('drop', this._handleDrop.bind(this));
    },

    _handleDragOver: function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.container.classList.add('drag-over');
    },

    _handleDragLeave: function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.container.classList.remove('drag-over');
    },

    _handleDrop: async function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.container.classList.remove('drag-over');

        let directoryHandle = null;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            for (const item of e.dataTransfer.items) {
                if (typeof item.getAsFileSystemHandle === 'function') {
                    try {
                        const handle = await item.getAsFileSystemHandle();
                        if (handle.kind === 'directory') {
                            directoryHandle = handle;
                            break;
                        }
                    } catch (err) {
                        console.warn('无法获取文件系统句柄:', err.message);
                    }
                }
            }
        }

        if (!directoryHandle) {
            EventBus.emit('modal:showAlert', {
                title: '操作不支持',
                message: '请拖放一个文件夹。此功能需要使用最新的Chrome、Edge或Opera浏览器。'
            });
            return;
        }

        EventBus.emit('modal:showConfirm', {
            title: '打开本地项目',
            message: `即将上传文件夹 "${directoryHandle.name}"。如果工作区中存在同名项目，其内容将被替换。`,
            onConfirm: async () => {
                const projectName = directoryHandle.name;
                await NetworkManager.uploadProject(directoryHandle, projectName);

                // 上传后，更新项目列表并激活新项目
                const projects = await NetworkManager.getProjects();
                Config.setProjectList(projects);
                Config.setActiveProject(projectName);

                EventBus.emit('modal:showAlert', { title: '成功', message: `项目 '${projectName}' 已成功加载！` });
            }
        });
    },

    bindAppEvents: function() {
        EventBus.on('project:activated', () => this.loadProjectTree());
        // 监听文件系统变更事件，并重新加载文件树
        EventBus.on('filesystem:changed', () => this.loadProjectTree());
    },

    loadProjectTree: async function() {
        if (!Config.currentProject) {
            this.showWelcomeView();
            EventBus.emit('git:statusChanged');
            return;
        }

        document.querySelector('#left-panel .panel-header h3').textContent = Config.activeProjectName;

        try {
            EventBus.emit('log:info', `正在加载项目 '${Config.activeProjectName}' 的文件树...`);
            const treeData = await NetworkManager.getFileTree('');

            if (!treeData) {
                this.container.innerHTML = `<li style="padding: 10px;">项目 '${Config.activeProjectName}' 为空或无法加载。</li>`;
                return;
            }

            const expansionState = this.getExpansionState(this.treeData);
            const previouslyFocused = this.focusedElement ? this.focusedElement.dataset.path : null;

            this.treeData = [this._transformObjectToFileNode(treeData)];
            this.render(expansionState, previouslyFocused);
            EventBus.emit('log:info', '项目文件树加载成功。');
            EventBus.emit('git:statusChanged');

            if (!this.focusedElement) {
                this.openDefaultFile();
            }
        } catch (error) {
            EventBus.emit('log:error', `加载项目树失败: ${error.message}`);
            this.container.innerHTML = `<li style="color: var(--color-error); padding: 10px;">加载项目树失败: ${error.message}</li>`;
        }
    },

    showWelcomeView: function() {
        document.querySelector('#left-panel .panel-header h3').textContent = '项目';
        this.container.innerHTML = `
            <div style="padding: 20px; color: var(--text-secondary); font-size: 0.9em;">
                <ul style="list-style-type: none; padding-left: 10px;">
                    <li style="margin-bottom: 8px;">
                        <button class="welcome-action-btn" data-action="open-folder" style="all: unset; cursor: pointer; color: var(--accent-color); text-decoration: underline;">
                           1. 从本地目录打开项目
                        </button>
                    </li>
                    <li style="margin-bottom: 8px;">
                        <button class="welcome-action-btn" data-action="clone-from-url" style="all: unset; cursor: pointer; color: var(--accent-color); text-decoration: underline;">
                           2. 通过远程仓库 URL 克隆项目
                        </button>
                    </li>
                    <li style="margin-bottom: 8px;">
                        <button class="welcome-action-btn" data-action="vcs-clone" style="all: unset; cursor: pointer; color: var(--accent-color); text-decoration: underline;">
                           3. 选择当前用户的代码仓库进行导入
                        </button>
                    </li>
                </ul>
            </div>
        `;
    },

    render: function(expansionState, previouslyFocusedPath) {
        this.container.innerHTML = '';
        const rootUl = document.createElement('ul');
        rootUl.className = 'file-tree';
        this.treeData.forEach(item => {
            this.renderNode(item, rootUl, expansionState);
        });
        this.container.appendChild(rootUl);

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

        this.setFocus(listItem);

        if (node.isFile()) {
            EventBus.emit('file:openRequest', path);
        } else if (node.isFolder()) {
            node.isExpanded = !node.isExpanded;
            listItem.classList.toggle('expanded');
        }
    },

    setFocus: function(element) {
        if (this.focusedElement) {
            this.focusedElement.classList.remove('focused');
        }
        element.classList.add('focused');
        this.focusedElement = element;
    },

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