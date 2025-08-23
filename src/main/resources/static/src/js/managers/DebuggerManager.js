// src/js/managers/DebuggerManager.js - 调试器面板管理器

import EventBus from '../utils/event-emitter.js';

/**
 * @description 管理“调试”面板的UI更新和状态。
 * 它负责接收来自后端的调试事件，并相应地更新变量、调用栈等信息。
 */
const DebuggerManager = {
    variablesList: null,
    callStackList: null,
    isDebugging: false,
    // ========================= 新增 START =========================
    isPending: false,
    // ========================= 新增 END ===========================

    /**
     * @description 初始化调试器管理器。
     */
    init: function() {
        const container = document.getElementById('debugger-panel');
        this.variablesList = container.querySelector('#debugger-variables');
        this.callStackList = container.querySelector('#debugger-call-stack');

        this.bindAppEvents();
        this.clear();
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        EventBus.on('debugger:clear', this.clear.bind(this));
        EventBus.on('debugger:eventReceived', this.handleDebugEvent.bind(this));
        // ========================= 新增 START =========================
        EventBus.on('debug:pending', this.handlePending.bind(this));
        // ========================= 新增 END ===========================
    },

    // ========================= 新增 START =========================
    /**
     * @description 处理调试请求已发出的“待定”状态。
     */
    handlePending: function() {
        if (!this.isDebugging && !this.isPending) {
            this.isPending = true;
            EventBus.emit('debugger:stateUpdated', true);
        }
    },

    /**
     * @description 检查调试会话是否处于活动（待定或正在调试）状态。
     * @returns {boolean}
     */
    isDebuggingActive: function() {
        return this.isDebugging || this.isPending;
    },
    // ========================= 新增 END ===========================

    /**
     * @description 处理从后端接收到的调试事件。
     * @param {object} eventData - 调试事件数据。
     */
    handleDebugEvent: function(eventData) {
        const wasActive = this.isDebuggingActive();

        switch (eventData.type) {
            case 'STARTED':
                this.isDebugging = true;
                this.isPending = false;
                this.clear();
                EventBus.emit('statusbar:updateStatus', '调试会话已启动...');
                break;
            case 'PAUSED':
                this.isDebugging = true;
                this.isPending = false;
                const { location, variables, callStack } = eventData.data;
                this.updateUI({ variables, callStack });
                EventBus.emit('debugger:highlightLine', {
                    filePath: location.filePath,
                    fileName: location.fileName,
                    lineNumber: location.lineNumber
                });
                EventBus.emit('ui:activateBottomPanelTab', 'debugger-panel');
                EventBus.emit('statusbar:updateStatus', `调试暂停于: ${location.fileName}:${location.lineNumber}`);
                break;
            case 'RESUMED':
                EventBus.emit('statusbar:updateStatus', '调试中...');
                EventBus.emit('debugger:clearHighlight');
                break;
            case 'TERMINATED':
                this.isDebugging = false;
                this.isPending = false;
                this.clear();
                EventBus.emit('debugger:clearHighlight');
                EventBus.emit('statusbar:updateStatus', '调试会话已结束');
                break;
        }

        const isActive = this.isDebuggingActive();
        if (wasActive !== isActive) {
            EventBus.emit('debugger:stateUpdated', isActive);
        }
    },

    /**
     * @description 根据传入的数据更新调试器UI。
     * @param {object} data - 包含变量和调用栈信息的对象。
     */
    updateUI: function({ variables, callStack }) {
        if (variables && variables.length > 0) {
            this.variablesList.innerHTML = ''; // 在添加新内容前清空列表
            variables.forEach(function(v) {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${v.name}</strong>: ${v.value} <span class="text-secondary">(${v.type})</span>`;
                this.variablesList.appendChild(li);
            }, this);
        } else {
            this.variablesList.innerHTML = '<li>无可用变量</li>';
        }

        if (callStack && callStack.length > 0) {
            this.callStackList.innerHTML = ''; // 在添加新内容前清空列表
            callStack.forEach(function(frame, index) {
                const li = document.createElement('li');
                li.textContent = `${frame.methodName} at ${frame.fileName}:${frame.lineNumber}`;
                if (index === 0) {
                    li.classList.add('highlight');
                }
                this.callStackList.appendChild(li);
            }, this);
        } else {
            this.callStackList.innerHTML = '<li>无调用栈信息</li>';
        }
    },

    /**
     * @description 清空调试器面板，恢复到默认状态。
     */
    clear: function() {
        this.variablesList.innerHTML = '<li>无信息</li>';
        this.callStackList.innerHTML = '<li>无信息</li>';
    }
};

export default DebuggerManager;