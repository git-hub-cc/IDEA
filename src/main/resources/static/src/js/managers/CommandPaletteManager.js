// src/js/managers/CommandPaletteManager.js

import EventBus from '../utils/event-emitter.js';

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

        // Get the language of the currently active file to filter commands.
        const activeLanguage = EventBus.emit('editor:getActiveLanguage')[0]; // A bit of a hack to get return value

        // Filter commands based on the active language.
        // Actions are always available, snippets are language-specific.
        const availableCommands = this.allCommands.filter(cmd =>
            cmd.type === 'action' || (cmd.type === 'snippet' && cmd.language === activeLanguage)
        );

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