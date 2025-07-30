// src/js/managers/DebuggerManager.js - 调试器面板管理器

import EventBus from '../utils/event-emitter.js';

const DebuggerManager = {
    variablesList: null,
    callStackList: null,
    isDebugging: false,

    init: function() {
        const container = document.getElementById('debugger-panel');
        this.variablesList = container.querySelector('#debugger-variables');
        this.callStackList = container.querySelector('#debugger-call-stack');

        this.bindAppEvents();
        this.clear(); // Initial clear
    },

    bindAppEvents: function() {
        EventBus.on('debugger:clear', this.clear.bind(this));
        EventBus.on('debugger:eventReceived', this.handleDebugEvent.bind(this));
    },

    handleDebugEvent: function(eventData) {
        switch(eventData.type) {
            case 'STARTED':
                this.isDebugging = true;
                this.clear();
                EventBus.emit('statusbar:updateStatus', '调试会话已启动...');
                break;

            case 'PAUSED':
                this.isDebugging = true;
                const { location, variables, callStack } = eventData.data;
                this.updateUI({ variables, callStack });
                EventBus.emit('debugger:highlightLine', {
                    filePath: location.filePath,
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
                this.clear();
                EventBus.emit('debugger:clearHighlight');
                EventBus.emit('statusbar:updateStatus', '调试会话已结束');
                break;
        }
    },

    updateUI: function({ variables, callStack }) {
        this.clear();

        // Render variables
        if (variables && variables.length > 0) {
            variables.forEach(v => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${v.name}</strong>: ${v.value} <span class="text-secondary">(${v.type})</span>`;
                this.variablesList.appendChild(li);
            });
        } else {
            this.variablesList.innerHTML = '<li>无可用变量</li>';
        }

        // Render call stack
        if (callStack && callStack.length > 0) {
            callStack.forEach((frame, index) => {
                const li = document.createElement('li');
                li.textContent = `${frame.methodName} at ${frame.fileName}:${frame.lineNumber}`;
                if (index === 0) {
                    li.classList.add('highlight');
                }
                this.callStackList.appendChild(li);
            });
        } else {
            this.callStackList.innerHTML = '<li>无调用栈信息</li>';
        }
    },

    clear: function() {
        this.variablesList.innerHTML = '<li>无信息</li>';
        this.callStackList.innerHTML = '<li>无信息</li>';
    }
};

export default DebuggerManager;