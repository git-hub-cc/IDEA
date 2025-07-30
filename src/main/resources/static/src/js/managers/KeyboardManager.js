// src/js/managers/KeyboardManager.js - 快捷键管理器
import EventBus from '../utils/event-emitter.js';

const KeyboardManager = {
    shortcuts: {},
    init: function() {
        this.registerDefaultShortcuts();
        this.addGlobalListener();
    },
    registerDefaultShortcuts: function() {
        this.register('Ctrl+S', 'action:save-file');
        this.register('Ctrl+N', 'action:new-file');
        this.register('Ctrl+O', 'action:open-folder'); // Changed
        this.register('Shift+F10', 'action:run-code');
        this.register('Shift+F9', 'action:debug-code');
        this.register('F8', 'action:step-over');
        this.register('F7', 'action:step-into');
        this.register('Shift+F8', 'action:step-out');
        this.register('F9', 'action:resume-debug');
        this.register('Ctrl+F2', 'action:stop-debug');
        this.register('Ctrl+K', 'action:vcs-commit');
    },
    register: function(keyString, eventName) {
        this.shortcuts[keyString.toLowerCase()] = eventName;
    },
    addGlobalListener: function() {
        document.addEventListener('keydown', (e) => {
            const modalOverlay = document.getElementById('modal-overlay');
            if (modalOverlay && modalOverlay.classList.contains('visible')) {
                if (e.key === 'Escape') EventBus.emit('modal:close');
                return;
            }
            const keyString = this.getKeyString(e);
            if (this.shortcuts[keyString]) {
                e.preventDefault();
                EventBus.emit(this.shortcuts[keyString]);
            }
        });
    },
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