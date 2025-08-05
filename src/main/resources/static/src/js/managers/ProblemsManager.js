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
        // ========================= 关键修改 START: 监听新的分析事件 =========================
        // 监听来自 ProjectAnalysisService 的后端分析结果
        EventBus.on('analysis:problems-updated', this.renderProblems.bind(this));
        // ========================= 关键修改 END ========================================

        // 当项目切换时，清空所有问题
        EventBus.on('project:activated', this.clearAllProblems.bind(this));
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


            fileProblems.forEach(problem => {
                const li = document.createElement('li');
                const type = (problem.type || 'ERROR').toLowerCase();
                const line = problem.lineNumber;
                const col = problem.columnNumber;

                li.className = `problem-item ${type}`;
                const iconClass = this._getProblemIcon(type);

                li.innerHTML = `<i class="${iconClass}"></i>${problem.message} <span class="problem-location">${line}:${col}</span>`;

                li.addEventListener('click', () => {
                    // 关键: filePath 应该相对于项目根目录
                    const projectRelativePath = this.getProjectRelativePath(problem.filePath);
                    EventBus.emit('editor:gotoLine', { filePath: projectRelativePath, lineNumber: line });
                });
                this.ulElement.appendChild(li);
            });
        }
    },

    // 辅助函数，从完整路径中提取项目相对路径
    getProjectRelativePath: function(fullPath) {
        // 假设路径格式为 "项目名/src/main/java/..."
        const pathParts = fullPath.split('/');
        if (pathParts.length > 1) {
            return pathParts.slice(1).join('/');
        }
        return fullPath;
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