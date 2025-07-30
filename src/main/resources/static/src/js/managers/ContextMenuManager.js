// src/js/managers/ContextMenuManager.js - 文件树右键菜单管理器

import EventBus from '../utils/event-emitter.js';

const ContextMenuManager = {
    menuElement: null,
    currentItem: null,

    /**
     * @description 初始化上下文菜单管理器。
     */
    init: function() {
        this.menuElement = document.getElementById('context-menu');
        this.bindAppEvents();
        this.bindDOMEvents();
    },

    /**
     * @description 绑定应用事件，主要用于显示菜单。
     */
    bindAppEvents: function() {
        EventBus.on('ui:showContextMenu', this.show.bind(this));
    },

    /**
     * @description 绑定DOM事件，用于处理菜单项点击和隐藏菜单。
     */
    bindDOMEvents: function() {
        // 使用事件委托处理菜单项点击
        this.menuElement.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.context-menu-item');
            if (menuItem && menuItem.dataset.action) {
                const action = menuItem.dataset.action;
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
     * @param {object} options - 包含坐标和项目信息的对象 { x, y, itemPath, itemType }。
     */
    show: function({ x, y, itemPath, itemType }) {
        this.currentItem = { path: itemPath, type: itemType };
        this.menuElement.innerHTML = ''; // 清空旧菜单

        const menuItems = this.getMenuItems(itemType);
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
     * @description 根据项目类型（文件或文件夹）获取对应的菜单项配置。
     * @param {string} type - 'file' 或 'folder'。
     * @returns {Array<object>} 菜单项配置数组。
     */
    getMenuItems: function(type) {
        const commonActions = [
            { label: '重命名', action: 'rename', icon: 'fas fa-pen' },
            { label: '删除', action: 'delete', icon: 'fas fa-trash-alt' },
        ];

        if (type === 'folder') {
            return [
                { label: '新建文件', action: 'new-file', icon: 'fas fa-file' },
                { label: '新建文件夹', action: 'new-folder', icon: 'fas fa-folder-plus' },
                { separator: true },
                ...commonActions
            ];
        } else { // file
            return commonActions;
        }
    }
};

export default ContextMenuManager;