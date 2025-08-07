// src/js/managers/ProblemsManager.js - “问题”面板管理器

import EventBus from '../utils/event-emitter.js';

/**
 * @description 管理“问题”面板的显示。它从项目分析服务接收问题数据，
 * 并将它们按文件分组进行渲染。
 */
const ProblemsManager = {
    ulElement: null,

    /**
     * @description 初始化问题管理器。
     */
    init: function() {
        this.ulElement = document.querySelector('#problems-list ul');
        this.bindAppEvents();
        this.renderProblems([]);
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        // 监听来自 ProjectAnalysisService 的后端分析结果
        EventBus.on('analysis:problems-updated', this.renderProblems.bind(this));
        // 当项目切换时，清空所有问题
        EventBus.on('project:activated', this.clearAllProblems.bind(this));
    },

    /**
     * @description 重新渲染整个“问题”面板。
     * @param {Array<object>} problems - 要渲染的问题列表。每个问题对象应包含
     * filePath, message, lineNumber, columnNumber, 和 type 属性。
     */
    renderProblems: function(problems) {
        this.clear();

        if (!problems || problems.length === 0) {
            this.ulElement.innerHTML = '<li>无问题</li>';
            return;
        }

        // 按文件路径对问题进行分组
        const problemsByFile = problems.reduce((acc, problem) => {
            const path = problem.filePath || '未知文件';
            if (!acc[path]) {
                acc[path] = [];
            }
            acc[path].push(problem);
            return acc;
        }, {});

        // 渲染分组后的问题
        for (const filePath in problemsByFile) {
            const fileProblems = problemsByFile[filePath];
            const shortFileName = filePath.split('/').pop();

            // 文件头
            const headerLi = document.createElement('li');
            headerLi.className = 'problem-file-header';
            headerLi.innerHTML = `<strong>${shortFileName}</strong> <span class="problem-count">${fileProblems.length}个问题</span>`;
            this.ulElement.appendChild(headerLi);

            // 问题列表
            fileProblems.forEach(function(problem) {
                const li = document.createElement('li');
                const type = (problem.type || 'ERROR').toLowerCase();
                const line = problem.lineNumber;
                const col = problem.columnNumber;
                li.className = `problem-item ${type}`;

                const iconClass = this._getProblemIcon(type);
                li.innerHTML = `<i class="${iconClass}"></i>${problem.message} <span class="problem-location">${line}:${col}</span>`;

                li.addEventListener('click', function() {
                    // ========================= 关键修改 START =========================
                    // 修正: 后端返回的 `problem.filePath` 已经是正确的项目相对路径，
                    // 无需再进行处理。之前的 `getProjectRelativePath` 方法错误地
                    // 移除了路径的第一部分 (如 'src')，导致路径错误和404。
                    EventBus.emit('editor:gotoLine', { filePath: problem.filePath, lineNumber: line });
                    // ========================= 关键修改 END ===========================
                }.bind(this));
                this.ulElement.appendChild(li);
            }, this);
        }
    },

    // ========================= 关键修改 START =========================
    // 移除错误的 `getProjectRelativePath` 方法，因为它是不必要的且导致了bug。
    // ========================= 关键修改 END ===========================

    /**
     * @description 清空所有问题。
     */
    clearAllProblems: function() {
        this.renderProblems([]);
    },

    /**
     * @description 根据问题类型获取对应的 Font Awesome 图标类名。
     * @param {string} type - 问题类型 ('error', 'warning', 'info')。
     * @returns {string} 图标类名。
     * @private
     */
    _getProblemIcon: function(type) {
        switch (type) {
            case 'error': return 'fas fa-times-circle';
            case 'warning': return 'fas fa-exclamation-triangle';
            case 'info': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    },

    /**
     * @description 清空问题列表的DOM内容。
     */
    clear: function() {
        if (this.ulElement) {
            this.ulElement.innerHTML = '';
        }
    }
};

export default ProblemsManager;