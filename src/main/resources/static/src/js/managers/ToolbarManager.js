// src/js/managers/ToolbarManager.js - 工具栏与调试控制按钮管理器

import EventBus from '../utils/event-emitter.js';

const ToolbarManager = {
    /**
     * @description 初始化工具栏管理器，为所有相关按钮绑定事件。
     */
    init: function() {
        const toolbar = document.getElementById('toolbar');
        const debuggerControls = document.querySelector('#debugger-panel .debugger-controls');

        this.bindButtons(toolbar.querySelectorAll('.toolbar-btn'));
        this.bindButtons(debuggerControls.querySelectorAll('button'));
    },

    /**
     * @description 为一组按钮绑定点击事件监听器。
     * @param {NodeListOf<Element>} buttons - 按钮元素列表。
     */
    bindButtons: function(buttons) {
        buttons.forEach(function(button) {
            button.addEventListener('click', function() {
                const action = button.dataset.action;
                if (action) {
                    // 将UI操作转换为具体的应用事件
                    EventBus.emit(`action:${action}`);
                }
            });
        });
    }
};

export default ToolbarManager;