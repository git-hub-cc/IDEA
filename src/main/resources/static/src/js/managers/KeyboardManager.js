// src/js/managers/KeyboardManager.js - 快捷键管理器
import EventBus from '../utils/event-emitter.js';

const KeyboardManager = {
    shortcuts: {},

    /**
     * 初始化快捷键管理器。
     * 这是一个异步函数，因为它需要从网络加载快捷键定义。
     */
    init: async function() {
        await this.loadShortcuts();
        this.addGlobalListener();
        EventBus.emit('log:info', '快捷键管理器已初始化。');
    },

    /**
     * 从 shortcuts.json 文件加载快捷键定义并注册它们。
     */
    loadShortcuts: async function() {
        try {
            const response = await fetch('src/js/data/shortcuts.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const shortcuts = await response.json();
            shortcuts.forEach(shortcut => {
                this.register(shortcut.keys, shortcut.event);
            });
        } catch (error) {
            console.error('加载快捷键定义失败:', error);
            EventBus.emit('log:error', '加载快捷键定义失败。');
        }
    },

    /**
     * 将一个快捷键组合映射到一个事件名称。
     * @param {string} keyString - 快捷键组合，例如 'Ctrl+S'。
     * @param {string} eventName - 要触发的事件名称。
     */
    register: function(keyString, eventName) {
        this.shortcuts[keyString.toLowerCase()] = eventName;
    },

    /**
     * 添加全局键盘事件监听器，用于捕获和处理快捷键。
     */
    addGlobalListener: function() {
        document.addEventListener('keydown', (e) => {
            const modalOverlay = document.getElementById('modal-overlay');
            // 如果模态框可见，则禁用大多数全局快捷键，除了 Escape
            if (modalOverlay && modalOverlay.classList.contains('visible')) {
                // 指令面板有自己的键盘处理逻辑，所以我们直接返回，不拦截
                if (modalOverlay.querySelector('.command-palette')) {
                    return;
                }
                if (e.key === 'Escape') EventBus.emit('modal:close');
                return;
            }

            const keyString = this.getKeyString(e);
            if (this.shortcuts[keyString]) {
                e.preventDefault();
                e.stopPropagation();
                EventBus.emit(this.shortcuts[keyString]);
            }
        }, true);
    },

    /**
     * 将键盘事件对象转换为规范化的字符串表示形式。
     * @param {KeyboardEvent} e - 键盘事件。
     * @returns {string|null} - 规范化的快捷键字符串或 null。
     */
    getKeyString: function(e) {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
        let modifier = '';
        if (e.ctrlKey) modifier += 'ctrl+';
        if (e.altKey) modifier += 'alt+';
        if (e.shiftKey) modifier += 'shift+';
        if (e.metaKey) modifier += 'cmd+';
        return modifier + e.key.toLowerCase();
    }
};

export default KeyboardManager;