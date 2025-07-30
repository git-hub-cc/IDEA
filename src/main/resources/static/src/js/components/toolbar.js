// toolbar.js - 工具栏按钮逻辑
export class Toolbar {
    constructor(containerId, eventBus) {
        this.container = document.getElementById(containerId);
        this.eventBus = eventBus;
        this.buttons = this.container.querySelectorAll('.toolbar-btn');
        this.addEventListeners();
    }

    addEventListeners() {
        this.buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                const action = button.dataset.action;
                this.eventBus.emit('toolbarAction', action); // 通过事件总线触发动作
            });
        });

        // 调试器控制按钮 (在 #debugger-panel 内部)
        const debuggerPanel = document.getElementById('debugger-panel');
        if (debuggerPanel) {
            const debugButtons = debuggerPanel.querySelectorAll('.debugger-controls button');
            debugButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const action = button.dataset.action;
                    this.eventBus.emit('toolbarAction', action); // 同样通过事件总线触发
                });
            });
        }
    }
}