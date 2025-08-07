// src/js/managers/KeyboardManager.js - 快捷键管理器
import EventBus from '../utils/event-emitter.js';

/**
 * @description 管理全局快捷键。它从JSON文件加载快捷键定义，
 * 监听键盘事件，并触发相应的应用事件。
 */
const KeyboardManager = {
    shortcuts: {},
    eventToKeysMap: new Map(),

    /**
     * @description 初始化快捷键管理器。
     * @returns {Promise<void>}
     */
    init: async function() {
        await this.loadShortcuts();
        this.addGlobalListener();
        EventBus.emit('log:info', '快捷键管理器已初始化。');
    },

    /**
     * @description 从 shortcuts.json 文件加载快捷键定义并注册它们。
     */
    loadShortcuts: async function() {
        try {
            const response = await fetch('src/js/data/shortcuts.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const shortcuts = await response.json();
            shortcuts.forEach(function(shortcut) {
                this.register(shortcut.keys, shortcut.event);
            }, this);
        } catch (error) {
            console.error('加载快捷键定义失败:', error);
            EventBus.emit('log:error', '加载快捷键定义失败。');
        }
    },

    /**
     * @description 注册一个快捷键组合到事件名称的映射。
     * @param {string} keyString - 快捷键组合，例如 'Ctrl+S'。
     * @param {string} eventName - 要触发的事件名称。
     */
    register: function(keyString, eventName) {
        this.shortcuts[keyString.toLowerCase()] = eventName;
        // 填充反向映射，用于根据事件名查找快捷键
        if (!this.eventToKeysMap.has(eventName)) {
            this.eventToKeysMap.set(eventName, []);
        }
        this.eventToKeysMap.get(eventName).push(keyString);
    },

    /**
     * @description 添加全局键盘事件监听器，用于捕获和处理快捷键。
     */
    addGlobalListener: function() {
        document.addEventListener('keydown', function(e) {
            const modalOverlay = document.getElementById('modal-overlay');
            // 如果模态框可见，则禁用大多数全局快捷键
            if (modalOverlay && modalOverlay.classList.contains('visible')) {
                // 指令面板有自己的键盘处理逻辑，直接返回
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
        }.bind(this), true);
    },

    /**
     * @description 将键盘事件对象转换为规范化的字符串表示形式。
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
    },

    /**
     * @description 根据事件名称获取其所有已注册的快捷键。
     * @param {string} eventName - 事件名称，例如 'action:save-file'。
     * @returns {string[]} - 快捷键字符串数组，例如 ['Ctrl+S']。
     */
    getShortcutsForEvent: function(eventName) {
        return this.eventToKeysMap.get(eventName) || [];
    }
};

export default KeyboardManager;