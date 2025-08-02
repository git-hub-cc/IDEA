// src/js/managers/KeyboardManager.js - 快捷键管理器
import EventBus from '../utils/event-emitter.js';

const KeyboardManager = {
    shortcuts: {},
    init: function() {
        this.registerDefaultShortcuts();
        this.addGlobalListener();
    },
    registerDefaultShortcuts: function() {
        // 文件 & 项目操作
        this.register('Ctrl+S', 'action:save-file');
        this.register('Ctrl+N', 'action:new-file');
        this.register('Alt+Insert', 'action:new-file'); // IDEA
        this.register('Ctrl+O', 'action:open-folder');
        this.register('Shift+F6', 'action:rename-active-file'); // IDEA

        // 运行 & 调试
        this.register('Shift+F10', 'action:run-code');
        this.register('Shift+F9', 'action:debug-code');
        this.register('F8', 'action:step-over');
        this.register('F7', 'action:step-into');
        this.register('Shift+F8', 'action:step-out');
        this.register('F9', 'action:resume-debug');
        this.register('Ctrl+F2', 'action:stop-debug');

        // 版本控制 (VCS)
        this.register('Ctrl+K', 'action:vcs-commit');
        this.register('Ctrl+T', 'action:vcs-pull');
        this.register('Ctrl+Shift+K', 'action:vcs-push');

        // 指令面板
        this.register('Ctrl+Shift+P', 'command-palette:show');
        this.register('F1', 'command-palette:show');

        // 编辑器功能 (IDEA 风格)
        this.register('Ctrl+Alt+L', 'action:format-code');
        this.register('Ctrl+F', 'action:find-in-file');
        this.register('Ctrl+D', 'editor:duplicate-line');
        this.register('Ctrl+Y', 'editor:delete-line');
        this.register('Ctrl+/', 'editor:toggle-line-comment');
        this.register('Ctrl+Shift+/', 'editor:toggle-block-comment');
        this.register('Ctrl+Shift+ArrowUp', 'editor:move-line-up');
        this.register('Ctrl+Shift+ArrowDown', 'editor:move-line-down');
        this.register('Ctrl+W', 'editor:expand-selection');
        this.register('Ctrl+Shift+W', 'editor:shrink-selection');
        // this.register('Ctrl+B', 'editor:goto-definition'); // 已移除
        this.register('Ctrl+G', 'editor:show-goto-line');
    },
    register: function(keyString, eventName) {
        this.shortcuts[keyString.toLowerCase()] = eventName;
    },
    addGlobalListener: function() {
        document.addEventListener('keydown', (e) => {
            const modalOverlay = document.getElementById('modal-overlay');
            if (modalOverlay && modalOverlay.classList.contains('visible')) {
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