// src/js/managers/CommandPaletteManager.js

import EventBus from '../utils/event-emitter.js';
import CodeEditorManager from './CodeEditorManager.js';
// ========================= 关键修改 START =========================
import KeyboardManager from './KeyboardManager.js'; // 导入快捷键管理器
// ========================= 关键修改 END ===========================


/**
 * Manages the command palette functionality, allowing users to search for
 * and execute commands and snippets.
 */
const CommandPaletteManager = {
    allCommands: [],
    isInitialized: false,

    init: async function() {
        await this.loadCommands();
        this.bindAppEvents();
        this.isInitialized = true;
        EventBus.emit('log:info', '指令面板已初始化。');
    },

    /**
     * Loads the command definitions from the JSON file.
     */
    loadCommands: async function() {
        try {
            const response = await fetch('src/js/data/commands.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.allCommands = await response.json();
        } catch (error) {
            console.error('Failed to load commands:', error);
            EventBus.emit('log:error', '加载指令失败。');
        }
    },

    bindAppEvents: function() {
        EventBus.on('command-palette:show', this.show.bind(this));
    },

    /**
     * Shows the command palette modal.
     */
    show: function() {
        if (!this.isInitialized || this.allCommands.length === 0) {
            EventBus.emit('modal:showAlert', { title: '错误', message: '指令面板不可用或指令加载失败。'});
            return;
        }

        const activeLanguage = CodeEditorManager.getActiveLanguage();

        // ========================= 关键修改 START =========================
        // 动态构建可用的指令列表，并附加上快捷键信息
        const availableCommands = this.allCommands
            .filter(cmd =>
                cmd.type === 'action' || (cmd.type === 'snippet' && cmd.language === activeLanguage)
            )
            .map(cmd => {
                // 如果是动作类型，则查询其快捷键
                if (cmd.type === 'action') {
                    const eventName = `action:${cmd.action}`;
                    const shortcuts = KeyboardManager.getShortcutsForEvent(eventName);

                    // 如果找到了快捷键，将其格式化并附加到描述中
                    if (shortcuts.length > 0) {
                        const shortcutText = `(${shortcuts.join(', ')})`;
                        return {
                            ...cmd,
                            // 创建一个新的描述，包含指令描述和动态获取的快捷键
                            description: `${cmd.description} ${shortcutText}`.trim()
                        };
                    }
                }
                // 对于代码片段或其他没有快捷键的动作，直接返回原样
                return cmd;
            });
        // ========================= 关键修改 END ===========================

        // Use the ModalManager to display a custom list prompt.
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
     * Executes a selected command.
     * @param {object} command - The command object to execute.
     */
    execute: function(command) {
        if (command.type === 'snippet') {
            // For snippets, we ask the CodeEditorManager to insert them.
            EventBus.emit('editor:insertSnippet', command.body);
        } else if (command.type === 'action') {
            // For actions, we trigger the corresponding global action event.
            EventBus.emit(`action:${command.action}`);
        }
    }
};

export default CommandPaletteManager;