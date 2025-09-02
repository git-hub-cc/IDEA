// src/js/managers/ContextMenuManager.js - 右键菜单管理器

import EventBus from '../utils/event-emitter.js';

/**
 * @description 管理应用内所有上下文菜单（右键菜单）的显示和行为。
 * 它通过一个全局监听器来捕获右键点击，并根据目标元素的类型动态构建菜单。
 */
const ContextMenuManager = {
    menuElement: null,
    currentItem: null,

    /**
     * @description 初始化上下文菜单管理器。
     */
    init: function() {
        this.menuElement = document.getElementById('context-menu');
        this.bindGlobalListener();
        this.bindMenuListener();
    },

    /**
     * @description 绑定全局的 'contextmenu' 事件监听器来捕获所有右键点击。
     */
    bindGlobalListener: function() {
        document.addEventListener('contextmenu', function(e) {
            const fileTreeItem = e.target.closest('#file-tree li[data-path]');
            const editorTabItem = e.target.closest('.editor-tab[data-file-path]');
            // ========================= 新增 START =========================
            const dockerContainerItem = e.target.closest('.resource-item[data-type="container"]');
            // ========================= 新增 END ===========================

            if (fileTreeItem) {
                e.preventDefault();
                const path = fileTreeItem.dataset.path;
                const type = fileTreeItem.dataset.type;
                // 当在文件树上右键时，让文件树管理器处理焦点
                EventBus.emit('filetree:focus', fileTreeItem);
                this.show({ x: e.clientX, y: e.clientY, item: { path, type }, type: 'file-tree' });
            } else if (editorTabItem) {
                e.preventDefault();
                const filePath = editorTabItem.dataset.filePath;
                // 确保右键点击的tab被激活
                EventBus.emit('file:openRequest', filePath);
                this.show({ x: e.clientX, y: e.clientY, item: { filePath }, type: 'editor-tab' });
                // ========================= 新增 START =========================
            } else if (dockerContainerItem) {
                e.preventDefault();
                const id = dockerContainerItem.dataset.id;
                const name = dockerContainerItem.dataset.name;
                const state = dockerContainerItem.dataset.state;
                this.show({ x: e.clientX, y: e.clientY, item: { id, name, state }, type: 'docker-container' });
            }
            // ========================= 新增 END ===========================
        }.bind(this));
    },

    /**
     * @description 为菜单本身绑定事件监听器，用于处理点击和关闭逻辑。
     */
    bindMenuListener: function() {
        // 使用事件委托处理菜单项点击
        this.menuElement.addEventListener('click', function(e) {
            const menuItem = e.target.closest('.context-menu-item');
            if (menuItem && menuItem.dataset.action) {
                const action = menuItem.dataset.action;
                // ========================= 修改 START =========================
                const eventPrefix = menuItem.dataset.eventPrefix || 'context-action';
                EventBus.emit(`${eventPrefix}:${action}`, this.currentItem);
                // ========================= 修改 END ===========================
                this.hide();
            }
        }.bind(this));

        // 点击页面其他任何地方都隐藏菜单
        document.addEventListener('click', function(e) {
            if (!this.menuElement.contains(e.target)) {
                this.hide();
            }
        }.bind(this));

        // 按下 Escape 键隐藏菜单
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                this.hide();
            }
        }.bind(this));
    },

    /**
     * @description 显示并构建上下文菜单。
     * @param {object} options - 包含坐标、上下文和类型的对象 { x, y, item, type }。
     */
    show: function({ x, y, item, type }) {
        this.currentItem = item; // 存储上下文，如 { path, type } 或 { filePath }
        this.menuElement.innerHTML = ''; // 清空旧菜单

        const menuItems = this.getMenuItemsForType(type);
        if (!menuItems) {
            return;
        }

        menuItems.forEach(function(item) {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                this.menuElement.appendChild(separator);
            } else {
                const li = document.createElement('li');
                li.className = 'context-menu-item';
                li.dataset.action = item.action;
                // ========================= 新增 START =========================
                if(item.eventPrefix) {
                    li.dataset.eventPrefix = item.eventPrefix;
                }
                // ========================= 新增 END ===========================
                li.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
                this.menuElement.appendChild(li);
            }
        }, this);

        this.menuElement.style.left = `${x}px`;
        this.menuElement.style.top = `${y}px`;
        this.menuElement.classList.add('visible');
    },

    /**
     * @description 隐藏上下文菜单。
     */
    hide: function() {
        this.menuElement.classList.remove('visible');
        this.currentItem = null;
    },

    /**
     * @description 根据菜单类型获取对应的菜单项配置。
     * @param {string} type - 'file-tree' 或 'editor-tab'。
     * @returns {Array<object>|null} 菜单项配置数组或null。
     */
    getMenuItemsForType: function(type) {
        switch (type) {
            case 'file-tree':
                return this.getFileTreeMenuItems(this.currentItem.type);
            case 'editor-tab':
                return this.getEditorTabMenuItems();
            // ========================= 新增 START =========================
            case 'docker-container':
                return this.getDockerContainerMenuItems(this.currentItem.state);
            // ========================= 新增 END ===========================
            default:
                return null;
        }
    },

    /**
     * @description 获取文件树的菜单项。
     * @param {string} itemType - 'file' 或 'folder'。
     * @returns {Array<object>}
     */
    getFileTreeMenuItems: function(itemType) {
        const commonActions = [
            { label: '重命名', action: 'rename', icon: 'fas fa-pen' },
            { label: '删除', action: 'delete', icon: 'fas fa-trash-alt' },
        ];

        const terminalAction = { label: '在终端中打开', action: 'open-in-terminal', icon: 'fas fa-terminal' };

        if (itemType === 'folder') {
            return [
                { label: '新建文件', action: 'new-file', icon: 'fas fa-file' },
                { label: '新建文件夹', action: 'new-folder', icon: 'fas fa-folder-plus' },
                { separator: true },
                terminalAction,
                { separator: true },
                ...commonActions,
            ];
        } else { // file
            return [
                terminalAction,
                { label: '下载', action: 'download', icon: 'fas fa-download' },
                { separator: true },
                ...commonActions
            ];
        }
    },

    /**
     * @description 获取编辑器标签页的菜单项。
     * @returns {Array<object>}
     */
    getEditorTabMenuItems: function() {
        return [
            { label: '关闭', action: 'close-tab', icon: 'fas fa-times' },
            { label: '关闭其他', action: 'close-other-tabs', icon: 'fas fa-times-circle' },
            { separator: true },
            { label: '关闭右侧', action: 'close-tabs-to-the-right', icon: 'fas fa-arrow-right' },
            { label: '关闭左侧', action: 'close-tabs-to-the-left', icon: 'fas fa-arrow-left' },
        ];
    },

    // ========================= 新增 START =========================
    /**
     * @description 获取 Docker 容器的菜单项。
     * @param {string} state - 容器的状态 ('running', 'exited', etc.)。
     * @returns {Array<object>}
     */
    getDockerContainerMenuItems: function(state) {
        const isRunning = state === 'running';
        const items = [];
        const eventPrefix = 'docker-action'; // 使用自定义前缀避免与全局 action 冲突

        if (isRunning) {
            items.push({ label: '停止', action: 'stop-container', icon: 'fas fa-stop', eventPrefix });
            items.push({ label: '重启', action: 'restart-container', icon: 'fas fa-sync-alt', eventPrefix });
        } else {
            items.push({ label: '启动', action: 'start-container', icon: 'fas fa-play', eventPrefix });
        }

        items.push({ separator: true });
        items.push({ label: '查看日志', action: 'view-logs', icon: 'fas fa-file-alt', eventPrefix });
        items.push({ label: '进入终端', action: 'exec-terminal', icon: 'fas fa-terminal', eventPrefix });
        items.push({ separator: true });
        items.push({ label: '删除', action: 'remove-container', icon: 'fas fa-trash-alt', eventPrefix });

        return items;
    },
    // ========================= 新增 END ===========================
};

export default ContextMenuManager;