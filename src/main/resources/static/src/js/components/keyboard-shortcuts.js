// keyboard-shortcuts.js - 快捷键模拟逻辑
export class KeyboardShortcuts {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.shortcuts = {}; // Map<keyString, callback>
        this.addGlobalListener();
    }

    // 注册快捷键
    registerShortcut(keyString, callback) {
        this.shortcuts[keyString] = callback;
    }

    // 添加全局键盘事件监听器
    addGlobalListener() {
        document.addEventListener('keydown', (e) => {
            // 如果模态框是可见的，通常不触发快捷键，除非模态框内部有特定的快捷键处理
            const modalOverlay = document.getElementById('modal-overlay');
            if (modalOverlay && modalOverlay.classList.contains('visible')) {
                // 允许Escape键关闭模态框
                if (e.key === 'Escape') {
                    // 如果模态框有自定义关闭逻辑，这里应该触发模态框的关闭事件
                    // 为简化，这里假设模态框管理类会处理 Escape 键
                    return;
                }
                return; // 模态框可见时，阻止其他快捷键
            }

            let key = e.key;
            let modifier = '';

            // 标准化键名
            if (key === ' ') key = 'Space';
            if (key === 'Escape') key = 'Esc';
            if (key === 'Control') return; // 不将修饰键本身作为触发键
            if (key === 'Shift') return;
            if (key === 'Alt') return;
            if (key === 'Meta') return; // Command key on Mac

            if (e.ctrlKey) modifier += 'Ctrl+';
            if (e.altKey) modifier += 'Alt+';
            if (e.shiftKey) modifier += 'Shift+';
            if (e.metaKey) modifier += 'Cmd+'; // Cmd for Mac

            // 对于功能键（F1-F12），直接使用键名
            // 对于字母键，通常使用大写（例如 Ctrl+S, Ctrl+A）
            if (key.length === 1 && key.match(/[a-zA-Z]/)) {
                key = key.toUpperCase();
            }

            const fullKeyString = modifier + key;

            if (this.shortcuts[fullKeyString]) {
                e.preventDefault(); // 阻止浏览器默认行为
                this.shortcuts[fullKeyString]();
                this.eventBus.emit('log', `[Keyboard] 快捷键 "${fullKeyString}" 被触发。`);
            }
        });
    }
}