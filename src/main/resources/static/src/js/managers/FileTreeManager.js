// src/js/managers/FileTreeManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import Config from '../config.js';
import { FileNode } from '../models/file-node.js';
import TemplateLoader from '../utils/TemplateLoader.js';

/**
 * @description 管理左侧文件树的显示、交互（点击、展开、折叠）
 * 以及拖放和粘贴等文件上传功能。
 * 采用增量更新（Reconciliation）策略来高效、稳定地更新UI。
 */
const FileTreeManager = {
    container: null,
    treeData: [],
    focusedElement: null,
    hoveredElement: null,
    // ========================= 新增 START =========================
    isLoading: false, // Mutex flag to prevent concurrent updates
    // ========================= 新增 END ===========================

    /**
     * @description 初始化文件树管理器。
     */
    init: function() {
        this.container = document.getElementById('file-tree');
        this.bindDOMEvents();
        this.bindAppEvents();
    },

    /**
     * @description 绑定文件树容器相关的DOM事件。
     */
    bindDOMEvents: function() {
        this.container.addEventListener('click', (e) => {
            const listItem = e.target.closest('li[data-path]');
            if (listItem) {
                this.handleNodeClick(listItem);
                return;
            }
            const actionBtn = e.target.closest('.welcome-action-btn');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                EventBus.emit(`action:${action}`);
            }
        });

        document.addEventListener('paste', this._handlePaste.bind(this));
        this.container.addEventListener('dragenter', this._handleDragEnter.bind(this));
        this.container.addEventListener('dragover', this._handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.container.addEventListener('drop', this._handleDrop.bind(this));
    },

    /**
     * @description 绑定应用级事件。
     */
    bindAppEvents: function() {
        EventBus.on('project:activated', () => this.loadProjectTree());
        EventBus.on('filesystem:changed', () => this.loadProjectTree());
        EventBus.on('filetree:focus', (element) => this.setFocus(element));
    },

    /**
     * @description 加载并渲染当前活动项目的文件树。
     * 如果文件树已存在，则执行增量更新；否则进行初始渲染。
     * 使用 isLoading 标志防止并发执行。
     */
    loadProjectTree: async function() {
        // ========================= 修改 START =========================
        if (this.isLoading) {
            EventBus.emit('log:info', '文件树正在更新中，忽略此次请求。');
            return;
        }
        this.isLoading = true;
        // ========================= 修改 END ===========================

        if (!Config.currentProject) {
            this.showWelcomeView();
            EventBus.emit('git:statusChanged');
            this.isLoading = false; // 释放锁
            return;
        }
        document.querySelector('#left-panel .panel-header h3').textContent = Config.activeProjectName;

        try {
            EventBus.emit('log:info', `正在加载项目 '${Config.activeProjectName}' 的文件树...`);
            const newTreeData = await NetworkManager.getFileTree('');

            if (!newTreeData) {
                this.container.innerHTML = `<li style="padding: 10px;">项目 '${Config.activeProjectName}' 为空或无法加载。</li>`;
                this.treeData = [];
                return;
            }

            const newRootNode = this._transformObjectToFileNode(newTreeData);
            const previouslyFocusedPath = this.focusedElement ? this.focusedElement.dataset.path : null;

            if (this.treeData.length === 0) {
                this._renderInitialTree(newRootNode);
                this.treeData = [newRootNode];
            } else {
                const oldRootNode = this.treeData[0];
                const rootUl = this.container.querySelector('.file-tree');

                this._reconcileNodeProperties(oldRootNode, newRootNode);

                if (rootUl) {
                    this._reconcileChildren(rootUl, oldRootNode, newRootNode);
                }
            }

            EventBus.emit('log:info', '项目文件树加载成功。');
            EventBus.emit('git:statusChanged');

            if (previouslyFocusedPath) {
                const elementToFocus = this.container.querySelector(`li[data-path="${previouslyFocusedPath}"]`);
                if (elementToFocus) {
                    this.setFocus(elementToFocus);
                }
            } else if (this.treeData.length > 0 && this.treeData[0].children.length > 0) {
                this.openDefaultFile();
            }

        } catch (error) {
            EventBus.emit('log:error', `加载项目树失败: ${error.message}`);
            this.container.innerHTML = `<li style="color: var(--color-error); padding: 10px;">加载项目树失败: ${error.message}</li>`;
        } finally {
            // ========================= 新增 START =========================
            this.isLoading = false; // 确保在函数结束时总是释放锁
            // ========================= 新增 END ===========================
        }
    },

    /**
     * @description 递归地协调（diff & patch）文件树的子节点，以实现最小化DOM更新。
     * @param {HTMLUListElement} parentElement - 包含子节点DOM的父UL元素。
     * @param {FileNode} oldParentNode - 当前的（旧的）父节点数据模型。
     * @param {FileNode} newParentNodeData - 从服务器获取的新的父节点数据。
     * @private
     */
    _reconcileChildren: function(parentElement, oldParentNode, newParentNodeData) {
        const oldChildren = oldParentNode.children;
        const newChildrenData = newParentNodeData.children;

        const oldNodesMap = new Map(oldChildren.map(node => [node.path, node]));
        const domChildrenMap = new Map();
        for (const child of parentElement.children) {
            domChildrenMap.set(child.dataset.path, child);
        }

        const newChildren = [];
        let lastDomElement = null;

        for (const newNodeData of newChildrenData) {
            const oldNode = oldNodesMap.get(newNodeData.path);

            if (oldNode) {
                // ========================= 修改 START: 增加防御性编程 =========================
                const domElement = domChildrenMap.get(oldNode.path);
                if (!domElement) {
                    console.warn(`Reconciliation inconsistency: Data model has node "${oldNode.path}" but DOM does not. Skipping.`);
                    oldNodesMap.delete(newNodeData.path); // 从待删除列表中移除，因为它实际已不在DOM中
                    continue; // 跳过此节点的处理
                }
                // ========================= 修改 END =========================================

                newNodeData.isExpanded = oldNode.isExpanded;
                this._reconcileNodeProperties(oldNode, newNodeData);

                if (oldNode.isFolder()) {
                    const childUl = domElement.querySelector('ul');
                    if (childUl) {
                        this._reconcileChildren(childUl, oldNode, newNodeData);
                    }
                }

                newChildren.push(oldNode);
                oldNodesMap.delete(newNodeData.path);
                lastDomElement = domElement;
            } else {
                const newDomElement = this._createNodeElement(newNodeData);

                if (lastDomElement) {
                    lastDomElement.after(newDomElement);
                } else {
                    parentElement.prepend(newDomElement);
                }
                newChildren.push(newNodeData);
                lastDomElement = newDomElement;
            }
        }

        for (const [path] of oldNodesMap.entries()) {
            const domToRemove = domChildrenMap.get(path);
            if (domToRemove) {
                parentElement.removeChild(domToRemove);
            }
        }

        oldParentNode.children = newChildren;
    },

    /**
     * @description 协调单个节点的属性（如名称、图标），并更新其DOM。
     * @param {FileNode} oldNode - 旧节点（活动数据模型中的节点）。
     * @param {FileNode} newNodeData - 从服务器获取的新节点数据。
     * @private
     */
    _reconcileNodeProperties: function(oldNode, newNodeData) {
        if (oldNode.name !== newNodeData.name) {
            oldNode.name = newNodeData.name;
            const domElement = this.container.querySelector(`li[data-path="${oldNode.path}"]`);
            if (domElement) {
                const span = domElement.querySelector('.node-label > span');
                if (span) span.textContent = oldNode.name;
                const icon = domElement.querySelector('.node-label > i');
                if (icon) icon.className = oldNode.isFolder() ? 'fas fa-folder' : this.getFileIcon(oldNode.name);
            }
        }
    },

    /**
     * @description 初始渲染整个文件树。
     * @param {FileNode} rootNode - 项目的根节点。
     * @private
     */
    _renderInitialTree: function(rootNode) {
        const fragment = document.createDocumentFragment();
        const rootUl = document.createElement('ul');
        rootUl.className = 'file-tree';

        const rootLi = this._createNodeElement(rootNode);
        rootUl.appendChild(rootLi);

        fragment.appendChild(rootUl);
        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    },

    /**
     * @description 创建一个文件或文件夹节点的 DOM 元素及其所有子元素（递归）。
     * @param {FileNode} node - 要渲染的节点。
     * @returns {HTMLLIElement} 渲染出的 `<li>` 元素。
     * @private
     */
    _createNodeElement: function(node) {
        const li = document.createElement('li');
        li.dataset.path = node.path;
        li.dataset.type = node.type;
        li.className = node.type;

        if (node.isFolder() && node.isExpanded) {
            li.classList.add('expanded');
        }

        const iconClass = node.isFolder() ? 'fas fa-folder' : this.getFileIcon(node.name);

        const nodeLabel = document.createElement('div');
        nodeLabel.className = 'node-label';
        nodeLabel.innerHTML = `<i class="${iconClass}"></i><span>${node.name}</span>`;
        li.appendChild(nodeLabel);

        if (node.isFolder() && node.children && node.children.length > 0) {
            const nestedUl = document.createElement('ul');
            node.children.forEach(child => {
                const childElement = this._createNodeElement(child);
                nestedUl.appendChild(childElement);
            });
            li.appendChild(nestedUl);
        }
        return li;
    },

    /**
     * @description 处理文件树节点的点击事件。
     * @param {HTMLElement} listItem - 被点击的 `<li>` 元素。
     */
    handleNodeClick: function(listItem) {
        const path = listItem.dataset.path;
        const node = FileNode.findNodeByPath(this.treeData, path);
        if (!node) {
            console.error(`点击的节点路径 "${path}" 在数据模型中未找到。数据可能已不同步。`);
            return;
        }

        this.setFocus(listItem);

        if (node.isFile()) {
            EventBus.emit('file:openRequest', path);
        } else if (node.isFolder()) {
            node.isExpanded = !node.isExpanded;
            listItem.classList.toggle('expanded', node.isExpanded);
        }
    },

    /**
     * @description 处理文件粘贴事件。
     * @param {ClipboardEvent} e - 粘贴事件对象。
     * @private
     */
    _handlePaste: async function(e) {
        const activeElement = document.activeElement;
        const isEditorFocused = activeElement && activeElement.closest('#monaco-container');
        const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

        if (isEditorFocused || isInputFocused) {
            return;
        }

        const items = e.clipboardData.items;
        if (!items || items.length === 0) return;

        let containsDirectory = Array.from(items).some(item =>
            (typeof item.webkitGetAsEntry === 'function' && item.webkitGetAsEntry()?.isDirectory)
        );
        if (containsDirectory) {
            e.preventDefault();
            EventBus.emit('modal:showAlert', {
                title: '不支持的操作',
                message: '不支持通过粘贴来上传文件夹。请使用拖放功能来上传整个文件夹。'
            });
            return;
        }

        const files = Array.from(e.clipboardData.files).filter(f => f);
        if (files.length === 0) return;

        e.preventDefault();

        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '操作无效', message: '请先选择一个项目再粘贴文件。' });
            return;
        }

        const focusedItem = this.getFocusedItem();
        let destinationPath = '';
        if (focusedItem) {
            destinationPath = (focusedItem.type === 'folder') ?
                focusedItem.path :
                focusedItem.path.substring(0, focusedItem.path.lastIndexOf('/'));
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

    /**
     * @description 处理拖放事件：dragenter。
     * @param {DragEvent} e
     * @private
     */
    _handleDragEnter: function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.container.classList.add('drag-over');
    },

    /**
     * @description 处理拖放事件：dragover。
     * @param {DragEvent} e
     * @private
     */
    _handleDragOver: function(e) {
        e.preventDefault();
        e.stopPropagation();
        const targetElement = e.target.closest('li[data-type="folder"]');
        if (this.hoveredElement && this.hoveredElement !== targetElement) {
            this.hoveredElement.classList.remove('drag-hover-target');
            this.hoveredElement = null;
        }
        if (targetElement && !targetElement.classList.contains('drag-hover-target')) {
            this.hoveredElement = targetElement;
            this.hoveredElement.classList.add('drag-hover-target');
        }
    },

    /**
     * @description 处理拖放事件：dragleave。
     * @param {DragEvent} e
     * @private
     */
    _handleDragLeave: function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.hoveredElement && e.target === this.hoveredElement) {
            this.hoveredElement.classList.remove('drag-hover-target');
            this.hoveredElement = null;
        }
        if (!this.container.contains(e.relatedTarget)) {
            this.container.classList.remove('drag-over');
            if (this.hoveredElement) {
                this.hoveredElement.classList.remove('drag-hover-target');
                this.hoveredElement = null;
            }
        }
    },

    /**
     * @description 处理拖放事件：drop。
     * @param {DragEvent} e
     * @private
     */
    _handleDrop: async function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.container.classList.remove('drag-over');
        if (this.hoveredElement) {
            this.hoveredElement.classList.remove('drag-hover-target');
        }

        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', {
                title: '操作无效',
                message: '请先打开一个项目，再拖拽文件或文件夹进行上传。'
            });
            this.hoveredElement = null;
            return;
        }

        const dropTarget = this.hoveredElement;
        this.hoveredElement = null;
        if (!dropTarget) {
            EventBus.emit('log:warn', '拖放操作未在有效目标上。请将文件拖放到一个文件夹上。');
            return;
        }

        const dataTransferItems = e.dataTransfer.items;
        if (!dataTransferItems || dataTransferItems.length === 0) return;

        const targetPath = dropTarget.dataset.path;
        const targetName = dropTarget.querySelector('span')?.textContent || targetPath || '项目根目录';

        EventBus.emit('log:info', `准备上传内容到目录: "${targetName}"`);
        await this._performUpload(dataTransferItems, targetPath);
    },

    /**
     * @description 执行实际的文件上传逻辑。
     * @param {DataTransferItemList} dataTransferItems
     * @param {string} destinationPath
     * @private
     */
    _performUpload: async function(dataTransferItems, destinationPath) {
        try {
            EventBus.emit('progress:start', { message: '正在分析文件...', total: 1 });
            const itemsToUpload = await this._getFilesFromDataTransfer(dataTransferItems);
            if (itemsToUpload.length === 0) {
                EventBus.emit('log:warn', '未找到可上传的文件或文件夹。');
                EventBus.emit('progress:finish');
                return;
            }
            const destinationName = destinationPath || '项目根目录';
            EventBus.emit('log:info', `准备将 ${itemsToUpload.length} 个项目上传至 ${destinationName}`);
            await NetworkManager.uploadDirectoryStructure(itemsToUpload, destinationPath);
            EventBus.emit('log:info', '上传成功。');
            EventBus.emit('filesystem:changed');
        } catch (error) {
            EventBus.emit('log:error', `上传失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '上传失败', message: error.message });
        } finally {
            EventBus.emit('progress:finish');
        }
    },

    /**
     * @description 从 DataTransferItemList 递归地提取所有文件和文件夹。
     * @param {DataTransferItemList} items
     * @returns {Promise<Array<object>>}
     * @private
     */
    _getFilesFromDataTransfer: async function(items) {
        const fileEntries = [];

        const readAllEntries = (dirReader) => {
            return new Promise((resolve, reject) => {
                const allEntries = [];
                const readBatch = () => {
                    dirReader.readEntries(entries => {
                        if (entries.length) {
                            allEntries.push(...entries);
                            readBatch();
                        } else {
                            resolve(allEntries);
                        }
                    }, reject);
                };
                readBatch();
            });
        };

        const processEntry = async (entry, pathPrefix = '') => {
            if (entry.isFile) {
                await new Promise((resolve, reject) => {
                    entry.file(file => {
                        fileEntries.push({ file: file, path: `${pathPrefix}${file.name}` });
                        resolve();
                    }, err => reject(err));
                });
            } else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                const entries = await readAllEntries(dirReader);
                for (const subEntry of entries) {
                    await processEntry(subEntry, `${pathPrefix}${entry.name}/`);
                }
            }
        };

        const promises = Array.from(items)
            .map(item => item.webkitGetAsEntry())
            .filter(entry => entry)
            .map(entry => processEntry(entry));
        await Promise.all(promises);
        return fileEntries;
    },

    /**
     * @description 当没有活动项目时，显示欢迎界面。
     */
    showWelcomeView: function() {
        document.querySelector('#left-panel .panel-header h3').textContent = '项目';
        const welcomeFragment = TemplateLoader.get('file-tree-welcome-template');
        this.container.innerHTML = '';
        if (welcomeFragment) {
            this.container.appendChild(welcomeFragment);
        }
        this.treeData = [];
        this.focusedElement = null;
    },

    /**
     * @description 设置文件树中的焦点元素。
     * @param {HTMLElement} element - 要设置焦点的元素。
     */
    setFocus: function(element) {
        if (this.focusedElement) {
            this.focusedElement.classList.remove('focused');
        }
        element.classList.add('focused');
        this.focusedElement = element;
    },

    /**
     * @description 获取当前拥有焦点的项的信息。
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

    /**
     * @description 根据文件名返回对应的 Font Awesome 图标类名。
     * @param {string} fileName - 文件名。
     * @returns {string} 图标类名。
     */
    getFileIcon: function(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            case 'java': return 'fab fa-java';
            case 'js': case 'jsx': return 'fab fa-js-square';
            case 'ts': case 'tsx': return 'fab fa-js-square';
            case 'py': return 'fab fa-python';
            case 'html': return 'fab fa-html5';
            case 'css': return 'fab fa-css3-alt';
            case 'vue': return 'fab fa-vuejs';
            case 'md': return 'fab fa-markdown';
            case 'xml': case 'pom': return 'fas fa-code';
            case 'json': return 'fas fa-file-alt';
            case 'yml': case 'yaml': return 'fas fa-file-contract';
            case 'properties': case 'conf': case 'env': return 'fas fa-cog';
            case 'gradle': return 'fas fa-cogs';
            case 'dockerfile': return 'fab fa-docker';
            case 'gitignore': return 'fab fa-git-alt';
            case 'sql': return 'fas fa-database';
            case 'png': case 'jpg': case 'jpeg': return 'fas fa-file-image';
            case 'mp4': case 'mov': return 'fas fa-file-video';
            case 'mp3': case 'wav': return 'fas fa-file-audio';
            default: return 'fas fa-file';
        }
    },

    /**
     * @description 尝试打开项目中的一个默认文件（例如，第一个.java文件）。
     */
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

    /**
     * @description 将后端返回的普通对象递归地转换为 FileNode 实例。
     * @param {object} obj - 后端返回的文件树对象。
     * @returns {FileNode|null}
     * @private
     */
    _transformObjectToFileNode: function(obj) {
        if (!obj) return null;
        const children = obj.children ? obj.children.map(child => this._transformObjectToFileNode(child)) : [];
        return new FileNode(obj.name, obj.type, obj.path, '', children, 'unchanged', false);
    }
};

export default FileTreeManager;