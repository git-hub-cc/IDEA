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

        document.addEventListener('paste', this._handlePaste.bind(this));

        this.container.addEventListener('dragover', this._handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.container.addEventListener('drop', this._handleDrop.bind(this));
    },

    _handlePaste: async function(e) {
        const activeElement = document.activeElement;
        const isEditorFocused = activeElement && activeElement.closest('#monaco-container');
        const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

        if (isEditorFocused || isInputFocused) {
            return;
        }

        const items = e.clipboardData.items;
        if (!items || items.length === 0) {
            return;
        }

        let containsDirectory = false;
        for (const item of items) {
            if (item.kind === 'file' && item.getAsFile() === null) {
                containsDirectory = true;
                break;
            }
            if (typeof item.webkitGetAsEntry === 'function') {
                const entry = item.webkitGetAsEntry();
                if (entry && entry.isDirectory) {
                    containsDirectory = true;
                    break;
                }
            }
        }

        if (containsDirectory) {
            e.preventDefault();
            EventBus.emit('modal:showAlert', {
                title: '不支持的操作',
                message: '不支持通过粘贴来上传文件夹。请使用拖放功能来上传整个文件夹。'
            });
            return;
        }

        const files = Array.from(e.clipboardData.files).filter(f => f);
        if (files.length === 0) {
            return;
        }

        e.preventDefault();

        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '操作无效', message: '请先选择一个项目再粘贴文件。' });
            return;
        }

        const focusedItem = this.getFocusedItem();
        let destinationPath = '';
        if (focusedItem) {
            destinationPath = (focusedItem.type === 'folder')
                ? focusedItem.path
                : focusedItem.path.substring(0, focusedItem.path.lastIndexOf('/'));
        }
        const destinationName = destinationPath || '项目根目录';

        EventBus.emit('modal:showConfirm', {
            title: '确认粘贴',
            message: `即将粘贴 ${files.length} 个文件到 "${destinationName}"。是否继续？`,
            onConfirm: async () => {
                try {
                    await NetworkManager.uploadFilesToPath(files, destinationPath);
                    EventBus.emit('log:info', `${files.length} 个文件已成功粘贴到 ${destinationName}`);
                    EventBus.emit('filesystem:changed');
                } catch (error) {
                    EventBus.emit('log:error', `粘贴文件失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '粘贴失败', message: error.message });
                }
            }
        });
    },


    bindAppEvents: function() {
        EventBus.on('project:activated', () => this.loadProjectTree());
        EventBus.on('filesystem:changed', () => this.loadProjectTree());
        EventBus.on('filetree:focus', (element) => this.setFocus(element));
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
                const projects = await NetworkManager.getProjects();
                Config.setProjectList(projects);
                Config.setActiveProject(projectName);
                EventBus.emit('modal:showAlert', { title: '成功', message: `项目 '${projectName}' 已成功加载！` });
            }
        });
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
                    <li style="margin-bottom: 8px;"><button class="welcome-action-btn" data-action="open-folder" style="all: unset; cursor: pointer; color: var(--accent-color); text-decoration: underline;">1. 从本地目录打开项目</button></li>
                    <li style="margin-bottom: 8px;"><button class="welcome-action-btn" data-action="clone-from-url" style="all: unset; cursor: pointer; color: var(--accent-color); text-decoration: underline;">2. 通过远程仓库 URL 克隆项目</button></li>
                    <li style="margin-bottom: 8px;"><button class="welcome-action-btn" data-action="vcs-clone" style="all: unset; cursor: pointer; color: var(--accent-color); text-decoration: underline;">3. 选择当前用户的代码仓库进行导入</button></li>
                </ul>
            </div>
        `;
    },

    render: function(expansionState, previouslyFocusedPath) {
        const fragment = document.createDocumentFragment();
        const rootUl = document.createElement('ul');
        rootUl.className = 'file-tree';

        if (this.treeData && this.treeData.length > 0) {
            this.treeData.forEach(item => {
                const nodeElement = this.renderNode(item, expansionState);
                rootUl.appendChild(nodeElement);
            });
        }

        fragment.appendChild(rootUl);
        this.container.innerHTML = ''; // Clear the container once
        this.container.appendChild(fragment); // Append the entire tree at once

        if (previouslyFocusedPath) {
            const elementToFocus = this.container.querySelector(`li[data-path="${previouslyFocusedPath}"]`);
            if (elementToFocus) {
                this.setFocus(elementToFocus);
            }
        }
    },

    renderNode: function(node, expansionState) {
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

        if (node.isFolder() && node.children) {
            const nestedUl = document.createElement('ul');
            node.children.forEach(child => {
                const childElement = this.renderNode(child, expansionState);
                nestedUl.appendChild(childElement);
            });
            li.appendChild(nestedUl);
        }

        return li;
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

    // ========================= 关键修改 START: 扩展文件图标 =========================
    getFileIcon: function(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            // Programming Languages
            case 'java': return 'fab fa-java';
            case 'js': case 'jsx': return 'fab fa-js-square';
            case 'ts': case 'tsx': return 'fab fa-js-square'; // No official TS icon in FA, use JS
            case 'py': return 'fab fa-python';
            case 'rb': return 'fas fa-gem'; // Ruby gem icon
            case 'php': return 'fab fa-php';
            case 'go': return 'fab fa-golang';
            case 'rs': return 'fab fa-rust';
            case 'kt': return 'fab fa-java'; // Kotlin is JVM, Java icon is a good proxy
            case 'c': case 'h': case 'cpp': case 'cs': return 'fas fa-file-code';

            // Web & Markup
            case 'html': return 'fab fa-html5';
            case 'css': return 'fab fa-css3-alt';
            case 'scss': return 'fab fa-sass';
            case 'less': return 'fab fa-less';
            case 'vue': return 'fab fa-vuejs';
            case 'md': case 'adoc': case 'asciidoc': return 'fab fa-markdown';
            case 'xml': case 'pom': case 'svg': return 'fas fa-code';

            // Config & Data
            case 'json': case 'gltf': return 'fas fa-file-alt';
            case 'yml': case 'yaml': return 'fas fa-file-contract';
            case 'toml': case 'ini': case 'properties': case 'conf': case 'env': return 'fas fa-cog';

            // Build & Version Control
            case 'gradle': return 'fas fa-cogs';
            case 'makefile': return 'fas fa-cogs';
            case 'dockerfile': case 'docker': return 'fab fa-docker';
            case 'gitignore': case 'ignore': return 'fab fa-git-alt';

            // Scripts & Database
            case 'sh': case 'bat': case 'cmd': return 'fas fa-terminal';
            case 'sql': return 'fas fa-database';

            // Text & Docs
            case 'txt': return 'fas fa-file-alt';
            case 'log': return 'fas fa-file-lines';
            case 'csv': case 'tsv': return 'fas fa-file-csv';
            case 'rtf': case 'tex': case 'odt': case 'mhtml': case 'pages': return 'fas fa-file-word';
            case 'ods': return 'fas fa-file-excel';
            case 'epub': case 'fb2': return 'fas fa-book-open';

            // Media (for completeness)
            case 'png': case 'jpg': case 'jpeg': case 'gif': case 'bmp': case 'webp': case 'ico': case 'avif': return 'fas fa-file-image';
            case 'mp4': case 'webm': case 'mov': return 'fas fa-file-video';
            case 'mp3': case 'wav': case 'flac': case 'ogg': return 'fas fa-file-audio';

            default: return 'fas fa-file';
        }
    },
    // ========================= 关键修改 END ======================================

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