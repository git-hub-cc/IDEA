// src/js/managers/ProblemsManager.js - “问题”面板管理器

import EventBus from '../utils/event-emitter.js';

const ProblemsManager = {
    ulElement: null,

    init: function() {
        this.ulElement = document.querySelector('#problems-list ul');
        this.bindAppEvents();
    },

    bindAppEvents: function() {
        // Now listens for real diagnostics data from the language server
        EventBus.on('diagnostics:updated', this.updateProblems.bind(this));
    },

    updateProblems: function(publishDiagnosticsParams) {
        this.clear();

        const problems = publishDiagnosticsParams.diagnostics;
        if (!problems || problems.length === 0) {
            this.ulElement.innerHTML = '<li>无问题</li>';
            return;
        }

        const fileUri = publishDiagnosticsParams.uri;
        // Attempt to convert file URI to a relative path for display
        let relativePath;
        try {
            const pathName = new URL(fileUri).pathname;
            // Assuming the project structure is consistent and we can find the project name
            const pathParts = pathName.split('/');
            const projectIndex = pathParts.indexOf('demo-project'); // Or get from config
            relativePath = pathParts.slice(projectIndex).join('/');
        } catch(e) {
            relativePath = fileUri; // Fallback to full URI
        }


        problems.forEach(problem => {
            const li = document.createElement('li');
            const type = this._convertSeverity(problem.severity);
            const line = problem.range.start.line + 1;
            const shortFileName = relativePath.split('/').pop();

            li.className = type;
            const iconClass = this._getProblemIcon(type);
            li.innerHTML = `<i class="${iconClass}"></i>${type.toUpperCase()}: ${problem.message} (${shortFileName}:${line})`;

            li.addEventListener('click', () => {
                EventBus.emit('editor:gotoLine', { filePath: relativePath, lineNumber: line });
                EventBus.emit('ui:activateBottomPanelTab', 'problems-list');
            });
            this.ulElement.appendChild(li);
        });
    },

    _convertSeverity(lspSeverity) {
        switch (lspSeverity) {
            case 1: return 'error'; // DiagnosticSeverity.Error
            case 2: return 'warning'; // DiagnosticSeverity.Warning
            case 3: return 'info'; // DiagnosticSeverity.Information
            case 4: return 'info'; // DiagnosticSeverity.Hint
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