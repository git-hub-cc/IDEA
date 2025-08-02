// src/js/managers/ProblemsManager.js - “问题”面板管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';

const ProblemsManager = {
    ulElement: null,
    allProblems: new Map(),

    init: function() {
        this.ulElement = document.querySelector('#problems-list ul');
        this.bindAppEvents();
        this.renderProblems();
    },

    bindAppEvents: function() {
        // 监听来自 CodeEditorManager 的前端分析结果事件
        EventBus.on('analysis:results', this.handleProblemsUpdate.bind(this));

        // 监听文件关闭事件，以清理特定文件的问题
        EventBus.on('problems:clearForFile', this.removeProblemsForFile.bind(this));

        // 当项目切换时，清空所有问题
        EventBus.on('project:activated', this.clearAllProblems.bind(this));
    },

    /**
     * @description 处理来自前端分析服务的问题更新。
     * @param {object} payload - 包含 { filePath, problems } 的对象。
     */
    handleProblemsUpdate: function({ filePath, errors }) {
        if (errors && errors.length > 0) {
            this.allProblems.set(filePath, errors);
        } else {
            this.allProblems.delete(filePath);
        }
        this.renderProblems();
    },

    /**
     * @description 重新渲染整个“问题”面板。
     */
    renderProblems: function() {
        this.clear();
        let totalProblems = 0;

        this.allProblems.forEach((problems, path) => {
            totalProblems += problems.length;

            problems.forEach(problem => {
                const li = document.createElement('li');
                const type = problem.severity || 'error';
                const line = problem.startLineNumber;
                const shortFileName = path.split('/').pop();

                li.className = type;
                const iconClass = this._getProblemIcon(type);

                li.innerHTML = `<i class="${iconClass}"></i>${problem.message} <span style="color:var(--text-secondary); margin-left: auto;">${shortFileName}:${line}</span>`;

                li.addEventListener('click', () => {
                    EventBus.emit('editor:gotoLine', { filePath: path, lineNumber: line });
                    EventBus.emit('ui:activateBottomPanelTab', 'problems-list');
                });
                this.ulElement.appendChild(li);
            });
        });

        if (totalProblems === 0) {
            this.ulElement.innerHTML = '<li>无问题</li>';
        }
    },

    /**
     * @description 当文件关闭时，移除该文件的所有问题。
     * @param {string} filePath - 被关闭的文件的路径。
     */
    removeProblemsForFile(filePath) {
        if (this.allProblems.has(filePath)) {
            this.allProblems.delete(filePath);
            this.renderProblems();
        }
    },

    clearAllProblems: function() {
        this.allProblems.clear();
        this.renderProblems();
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