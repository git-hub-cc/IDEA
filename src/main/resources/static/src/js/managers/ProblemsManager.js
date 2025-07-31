// src/js/managers/ProblemsManager.js - “问题”面板管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';

const ProblemsManager = {
    ulElement: null,
    // Store problems keyed by file path
    allProblems: new Map(),

    init: function() {
        this.ulElement = document.querySelector('#problems-list ul');
        this.bindAppEvents();
    },

    bindAppEvents: function() {
        EventBus.on('diagnostics:updated', this.handleNewDiagnostics.bind(this));
        // Clear all problems when project changes
        EventBus.on('project:activated', this.clearAllProblems.bind(this));
        // When a file is closed, remove its problems from the view
        EventBus.on('file:closeRequest', this.removeProblemsForFile.bind(this));
    },

    handleNewDiagnostics: function({ relativePath, diagnostics }) {
        // Store the latest diagnostics for the file
        this.allProblems.set(relativePath, diagnostics);
        this.renderProblems();
    },

    renderProblems: function() {
        this.clear();

        let totalProblems = 0;

        this.allProblems.forEach((problems, path) => {
            if (problems && problems.length > 0) {
                totalProblems += problems.length;

                problems.forEach(problem => {
                    const li = document.createElement('li');
                    const type = this._convertSeverity(problem.severity);
                    const line = problem.range.start.line + 1;
                    const shortFileName = path.split('/').pop();

                    li.className = type;
                    const iconClass = this._getProblemIcon(type);
                    // Use the relativePath from the backend
                    li.innerHTML = `<i class="${iconClass}"></i>${problem.message} <span style="color:var(--text-secondary); margin-left: auto;">${shortFileName}:${line}</span>`;

                    li.addEventListener('click', () => {
                        // The relative path is correct for opening the file
                        EventBus.emit('editor:gotoLine', { filePath: path, lineNumber: line });
                        EventBus.emit('ui:activateBottomPanelTab', 'problems-list');
                    });
                    this.ulElement.appendChild(li);
                });
            }
        });

        if (totalProblems === 0) {
            this.ulElement.innerHTML = '<li>无问题</li>';
        }
    },

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

    _convertSeverity(lspSeverity) {
        switch (lspSeverity) {
            case 1: return 'error';   // DiagnosticSeverity.Error
            case 2: return 'warning'; // DiagnosticSeverity.Warning
            case 3: return 'info';    // DiagnosticSeverity.Information
            case 4: return 'info';    // DiagnosticSeverity.Hint
            default: return 'info';
        }
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
        this.ulElement.innerHTML = '';
    }
};

export default ProblemsManager;