// src/js/managers/ProblemsManager.js - “问题”面板管理器

import EventBus from '../utils/event-emitter.js';

const ProblemsManager = {
    ulElement: null,

    init: function() {
        this.ulElement = document.querySelector('#problems-list ul');
        this.bindAppEvents();
        this.renderProblems([]);
    },

    bindAppEvents: function() {
        // 监听来自后端的编译结果
        // EventBus.on('compiler:results', this.handleProblemsUpdate.bind(this));

        // 当项目切换时，清空所有问题
        EventBus.on('project:activated', this.clearAllProblems.bind(this));
    },

    /**
     * @description 处理来自后端的问题更新。
     * @param {Array<object>} problems - 问题对象数组。
     */
    handleProblemsUpdate: function(problems) {
        this.renderProblems(problems);
    },

    /**
     * @description 重新渲染整个“问题”面板。
     * @param {Array<object>} problems - 要渲染的问题列表。
     */
    renderProblems: function(problems) {
        this.clear();

        if (!problems || problems.length === 0) {
            this.ulElement.innerHTML = '<li>无问题</li>';
            return;
        }

        problems.forEach(problem => {
            const li = document.createElement('li');
            const type = (problem.type || 'error').toLowerCase();
            const line = problem.lineNumber;
            const shortFileName = (problem.filePath || '未知文件').split('/').pop();

            li.className = type;
            const iconClass = this._getProblemIcon(type);

            li.innerHTML = `<i class="${iconClass}"></i>${problem.message} <span style="color:var(--text-secondary); margin-left: auto;">${shortFileName}:${line}</span>`;

            li.addEventListener('click', () => {
                EventBus.emit('editor:gotoLine', { filePath: problem.filePath, lineNumber: line });
                EventBus.emit('ui:activateBottomPanelTab', 'problems-list');
            });
            this.ulElement.appendChild(li);
        });
    },

    clearAllProblems: function() {
        this.renderProblems([]);
    },

    _getProblemIcon: function(type) {
        switch (type) {
            case 'error': return 'fas fa-times-circle';
            case 'warning': return 'fas fa-exclamation-triangle';
            case 'info': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    },

    clear: function() {
        if (this.ulElement) {
            this.ulElement.innerHTML = '';
        }
    }
};

export default ProblemsManager;