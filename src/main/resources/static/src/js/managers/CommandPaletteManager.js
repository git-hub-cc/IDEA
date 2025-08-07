// src/js/managers/CommandPaletteManager.js - 指令面板管理器

import EventBus from '../utils/event-emitter.js';
import CodeEditorManager from './CodeEditorManager.js';
import KeyboardManager from './KeyboardManager.js';

/**
 * @description 管理指令面板（Command Palette）的功能，允许用户搜索并执行指令和代码片段。
 */
const CommandPaletteManager = {
    allCommands: [],
    isInitialized: false,

    /**
     * @description 初始化指令面板管理器。
     * @returns {Promise<void>}
     */
    init: async function() {
        await this.loadCommands();
        this.bindAppEvents();
        this.isInitialized = true;
        EventBus.emit('log:info', '指令面板已初始化。');
    },

    /**
     * @description 从JSON文件加载指令定义。
     */
    loadCommands: async function() {
        try {
            const response = await fetch('src/js/data/commands.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.allCommands = await response.json();
        } catch (error) {
            console.error('加载指令失败:', error);
            EventBus.emit('log:error', '加载指令失败。');
        }
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        EventBus.on('command-palette:show', this.show.bind(this));
    },

    /**
     * @description 显示指令面板模态框。
     */
    show: function() {
        if (!this.isInitialized || this.allCommands.length === 0) {
            EventBus.emit('modal:showAlert', { title: '错误', message: '指令面板不可用或指令加载失败。' });
            return;
        }

        const activeLanguage = CodeEditorManager.getActiveLanguage();

        // 动态构建可用的指令列表，并附加上快捷键信息
        const availableCommands = this.allCommands
            .filter(cmd =>
                cmd.type === 'action' || (cmd.type === 'snippet' && cmd.language === activeLanguage)
            )
            .map(function(cmd) {
                if (cmd.type === 'action') {
                    const eventName = `action:${cmd.action}`;
                    const shortcuts = KeyboardManager.getShortcutsForEvent(eventName);
                    if (shortcuts.length > 0) {
                        const shortcutText = `(${shortcuts.join(', ')})`;
                        return {
                            ...cmd,
                            description: `${cmd.description} ${shortcutText}`.trim()
                        };
                    }
                }
                return cmd;
            });

        EventBus.emit('modal:showListPrompt', {
            title: '指令面板',
            items: availableCommands,
            onConfirm: (selectedCommandId) => {
                const command = this.allCommands.find(cmd => cmd.id === selectedCommandId);
                if (command) {
                    this.execute(command);
                }
            }
        });
    },

    /**
     * @description 执行选定的指令。
     * @param {object} command - 要执行的指令对象。
     */
    execute: function(command) {
        if (command.type === 'snippet') {
            EventBus.emit('editor:insertSnippet', command.body);
        } else if (command.type === 'action') {
            EventBus.emit(`action:${command.action}`);
        }
    }
};

export default CommandPaletteManager;