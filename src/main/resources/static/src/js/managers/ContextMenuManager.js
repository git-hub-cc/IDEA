// src/js/managers/ContextMenuManager.js - 右键菜单管理器

import EventBus from '../utils/event-emitter.js';

const ContextMenuManager = {
    menuElement: null,
    currentItem: null,

    init: function() {
        this.menuElement = document.getElementById('context-menu');
        this.bindDOMEvents();

        // 使用一个全局的 contextmenu 监听器来处理所有右键点击事件
        document.addEventListener('contextmenu', (e) => {
            const fileTreeItem = e.target.closest('#file-tree li[data-path]');
            const editorTabItem = e.target.closest('.editor-tab[data-file-path]');

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
            }
        });
    },

    bindDOMEvents: function() {
        // 使用事件委托处理菜单项点击
        this.menuElement.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.context-menu-item');
            if (menuItem && menuItem.dataset.action) {
                const action = menuItem.dataset.action;
                // 'currentItem' 持有上下文信息 (如 { filePath })
                EventBus.emit(`context-action:${action}`, this.currentItem);
                this.hide();
            }
        });

        // 点击页面其他任何地方都隐藏菜单
        document.addEventListener('click', (e) => {
            if (!this.menuElement.contains(e.target)) {
                this.hide();
            }
        });
        // 按下 Escape 键隐藏菜单
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    },

    /**
     * @description 显示并构建上下文菜单。
     * @param {object} options - 包含坐标、上下文和类型的对象 { x, y, item, type }。
     */
    show: function({ x, y, item, type }) {
        this.currentItem = item; // 存储上下文，如 { path, type } 或 { filePath }
        this.menuElement.innerHTML = ''; // 清空旧菜单

        const menuItems = this.getMenuItemsForType(type);
        if (!menuItems) return;

        menuItems.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                this.menuElement.appendChild(separator);
            } else {
                const li = document.createElement('li');
                li.className = 'context-menu-item';
                li.dataset.action = item.action;
                li.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
                this.menuElement.appendChild(li);
            }
        });

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
            default:
                return null;
        }
    },

    // ========================= 关键修改 START =========================
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
    // ========================= 关键修改 END ===========================

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
};

export default ContextMenuManager;