// src/js/managers/CodeEditorManager.js - 代码编辑器管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const CodeEditorManager = {
    monacoInstance: null,
    editorArea: null,
    tabBar: null,
    openFiles: new Map(), // Map<filePath, { model, tabEl, isDirty, viewState }>
    activeFilePath: null,
    debugDecorations: [],
    breakpointDecorations: [],

    init: function() {
        return new Promise((resolve) => {
            this.editorArea = document.getElementById('editor-area');
            this.tabBar = document.getElementById('editor-tab-bar');

            this._createMonacoInstance();
            this.bindAppEvents();

            EventBus.emit('log:info', '代码编辑器模块已初始化。');
            resolve();
        });
    },

    _createMonacoInstance: function() {
        if (!window.monaco) {
            EventBus.emit('log:error', 'Monaco Editor未能加载，代码编辑器无法初始化。');
            return;
        }
        this.monacoInstance = window.monaco.editor.create(this.editorArea, {
            value: '// 欢迎使用 Web IDEA！请从左侧文件树中选择一个文件以开始。',
            language: 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            wordWrap: 'on',
            glyphMargin: true, // 为断点和调试器图标启用边距
        });

        this.monacoInstance.onDidChangeModelContent(() => this.handleContentChange());
        this.monacoInstance.onDidChangeCursorPosition((e) => this.handleCursorChange(e));
        this.monacoInstance.onMouseDown((e) => this.handleGutterMouseDown(e));

        this.setupCodeCompletion();
    },

    bindAppEvents: function() {
        EventBus.on('file:openRequest', this.openFile.bind(this));
        EventBus.on('file:saveRequest', this.saveActiveFile.bind(this));
        EventBus.on('file:closeRequest', this.closeFile.bind(this));
        EventBus.on('editor:resize', () => this.resizeEditor());
        EventBus.on('editor:gotoLine', (payload) => this.gotoLine(payload));
        EventBus.on('debugger:highlightLine', (payload) => this.highlightDebugLine(payload));
        EventBus.on('debugger:clearHighlight', () => this.clearDebugHighlight());
        EventBus.on('theme:changed', (theme) => this.setTheme(theme));
        EventBus.on('settings:changed', this.applySettings.bind(this));
        EventBus.on('diagnostics:updated', this.updateDiagnostics.bind(this));
    },

    openFile: async function(filePath) {
        if (this.activeFilePath && this.openFiles.has(this.activeFilePath)) {
            this.openFiles.get(this.activeFilePath).viewState = this.monacoInstance.saveViewState();
        }

        if (this.openFiles.has(filePath)) {
            this.setActiveFile(filePath);
            return;
        }

        try {
            const content = await NetworkManager.getFileContent(filePath);
            const language = this._getLanguageFromPath(filePath);
            const model = window.monaco.editor.createModel(content, language, window.monaco.Uri.parse(`file:///${filePath}`));

            const tabEl = this._createFileTab(filePath);
            this.openFiles.set(filePath, { model, tabEl, isDirty: false, viewState: null });

            this.setActiveFile(filePath);
            EventBus.emit('log:info', `文件 '${filePath}' 已打开。`);
        } catch (error) {
            EventBus.emit('log:error', `打开文件 ${filePath} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '错误', message: `打开文件失败: ${error.message}` });
        }
    },

    saveActiveFile: async function() {
        if (!this.activeFilePath || !this.openFiles.has(this.activeFilePath)) {
            EventBus.emit('log:warn', '没有活动文件可供保存。');
            return;
        }

        const fileInfo = this.openFiles.get(this.activeFilePath);
        if (!fileInfo.isDirty) {
            EventBus.emit('statusbar:updateStatus', '文件无需保存', 1500);
            return;
        }

        const content = fileInfo.model.getValue();
        EventBus.emit('statusbar:updateStatus', '正在保存...', 0);
        try {
            await NetworkManager.saveFileContent(this.activeFilePath, content);
            this._setFileDirty(this.activeFilePath, false);
            EventBus.emit('log:info', `文件 '${this.activeFilePath}' 已成功保存。`);
            EventBus.emit('statusbar:updateStatus', '文件已保存', 2000);
            EventBus.emit('git:statusChanged');
        } catch (error) {
            EventBus.emit('log:error', `保存文件 ${this.activeFilePath} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '保存失败', message: error.message });
        }
    },

    closeFile: function(filePath) {
        const fileInfo = this.openFiles.get(filePath);
        if (!fileInfo) return;

        // 如果文件未保存，可以加入确认逻辑
        // if (fileInfo.isDirty) { ... }

        fileInfo.model.dispose();
        fileInfo.tabEl.remove();
        this.openFiles.delete(filePath);
        window.monaco.editor.setModelMarkers(fileInfo.model, 'owner', []); // 清除标记

        if (this.activeFilePath === filePath) {
            this.activeFilePath = null;
            if (this.openFiles.size > 0) {
                const nextFilePath = Array.from(this.openFiles.keys()).pop();
                this.setActiveFile(nextFilePath);
            } else {
                this.monacoInstance.setModel(null);
                EventBus.emit('statusbar:clearFileInfo');
            }
        }
    },

    setActiveFile: function(filePath) {
        if (this.activeFilePath === filePath) return;

        if (this.activeFilePath && this.openFiles.has(this.activeFilePath)) {
            this.openFiles.get(this.activeFilePath).tabEl.classList.remove('active');
        }

        const fileInfo = this.openFiles.get(filePath);
        fileInfo.tabEl.classList.add('active');

        this.monacoInstance.setModel(fileInfo.model);
        if (fileInfo.viewState) {
            this.monacoInstance.restoreViewState(fileInfo.viewState);
        }
        this.monacoInstance.focus();
        this.activeFilePath = filePath;

        const position = this.monacoInstance.getPosition() || { lineNumber: 1, column: 1 };
        EventBus.emit('statusbar:updateFileInfo', { path: filePath, language: this._getLanguageFromPath(filePath), ...position });
        this._setFileDirty(filePath, fileInfo.isDirty);
    },

    handleContentChange: function() { if (this.activeFilePath) { this._setFileDirty(this.activeFilePath, true); } },
    handleCursorChange: function(e) { if (this.activeFilePath) { EventBus.emit('statusbar:updateCursorPos', e.position); } },

    handleGutterMouseDown: function(e) {
        if (e.target.type === window.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            const lineNumber = e.target.position.lineNumber;
            this.toggleBreakpoint(this.activeFilePath, lineNumber);
        }
    },

    toggleBreakpoint: async function(filePath, lineNumber) {
        if (!filePath) return;
        const model = this.monacoInstance.getModel();
        if (!model) return;

        const decorations = model.getLineDecorations(lineNumber) || [];
        const existingBreakpoint = decorations.find(d => d.options.glyphMarginClassName === 'breakpoint-decorator');
        const shouldEnable = !existingBreakpoint;

        try {
            await NetworkManager.toggleBreakpoint({ filePath, lineNumber, enabled: shouldEnable });
            this.updateBreakpointDecorations(filePath, lineNumber, shouldEnable);
            EventBus.emit('log:info', `${shouldEnable ? '设置' : '移除'}断点于 ${filePath}:${lineNumber}`);
        } catch (error) {
            EventBus.emit('log:error', `切换断点失败: ${error.message}`);
        }
    },

    updateBreakpointDecorations: function(filePath, lineNumber, enabled) {
        const model = this.monacoInstance.getModel();
        if (model.uri.path.substring(1) !== filePath) return; // Only update decorations for the correct model

        let newDecorations = [];
        const oldDecorations = this.breakpointDecorations.filter(d => {
            const isSameLine = d.range.startLineNumber === lineNumber;
            if (!isSameLine) newDecorations.push(d);
            return isSameLine;
        });

        this.breakpointDecorations = this.monacoInstance.deltaDecorations(oldDecorations.map(d => d.id), enabled ? [{
            range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
                isWholeLine: false,
                glyphMarginClassName: 'breakpoint-decorator',
                stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            }
        }] : []);
    },

    _createFileTab: function(filePath) {
        const tab = document.createElement('div');
        tab.className = 'editor-tab';
        tab.dataset.filePath = filePath;
        const fileName = filePath.split('/').pop();
        tab.innerHTML = `<span>${fileName}</span><span class="unsaved-indicator" title="未保存">●</span><i class="fas fa-times close-tab-btn" title="关闭"></i>`;
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('close-tab-btn')) {
                e.stopPropagation();
                this.closeFile(filePath);
            } else {
                this.setActiveFile(filePath);
            }
        });
        this.tabBar.appendChild(tab);
        return tab;
    },

    _setFileDirty: function(filePath, isDirty) {
        const fileInfo = this.openFiles.get(filePath);
        if (fileInfo) {
            fileInfo.isDirty = isDirty;
            fileInfo.tabEl.classList.toggle('modified', isDirty);
            if (this.activeFilePath === filePath) {
                EventBus.emit('statusbar:markUnsaved', isDirty);
            }
        }
    },

    _getLanguageFromPath: function(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        // ... (switch case remains the same)
        switch (ext) {
            case 'java': return 'java';
            case 'js': return 'javascript';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'xml': case 'pom': return 'xml';
            case 'json': return 'json';
            case 'md': return 'markdown';
            default: return 'plaintext';
        }
    },

    resizeEditor: function() { this.monacoInstance?.layout(); },

    gotoLine: function({ filePath, lineNumber }) {
        const openAndReveal = () => {
            this.monacoInstance.setPosition({ lineNumber, column: 1 });
            this.monacoInstance.revealLineInCenter(lineNumber);
            this.monacoInstance.focus();
        };

        if (this.activeFilePath !== filePath) {
            this.openFile(filePath).then(openAndReveal);
        } else {
            openAndReveal();
        }
    },

    highlightDebugLine: function({ filePath, lineNumber }) {
        this.gotoLine({ filePath, lineNumber });
        this.clearDebugHighlight(); // Clear previous highlights
        this.debugDecorations = this.monacoInstance.deltaDecorations([], [{
            range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
                isWholeLine: true,
                className: 'debug-line-highlight',
                linesDecorationsClassName: 'debug-line-decorator-gutter'
            }
        }]);
    },

    clearDebugHighlight: function() {
        this.debugDecorations = this.monacoInstance.deltaDecorations(this.debugDecorations, []);
    },

    setTheme: function(theme) {
        if (window.monaco) {
            const monacoTheme = theme.includes('dark') ? 'vs-dark' : 'vs';
            window.monaco.editor.setTheme(monacoTheme);
        }
    },

    applySettings: function(settings) {
        this.monacoInstance.updateOptions({
            fontSize: settings.fontSize,
            wordWrap: settings.wordWrap ? 'on' : 'off',
            fontFamily: settings.editorFontFamily
        });
        this.setTheme(settings.theme);
    },

    updateDiagnostics: function(diagnostics) {
        const fileUri = diagnostics.uri;
        const model = window.monaco.editor.getModels().find(m => m.uri.toString() === fileUri);
        if (!model) return;

        const markers = diagnostics.diagnostics.map(d => ({
            message: d.message,
            severity: d.severity === monaco.MarkerSeverity.Error ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
            source: 'LSP',
        }));

        window.monaco.editor.setModelMarkers(model, 'lsp', markers);
    },

    setupCodeCompletion: function() {
        if (!window.monaco) return;
        monaco.languages.registerCompletionItemProvider('java', {
            provideCompletionItems: async (model, position) => {
                const filePath = model.uri.path.substring(1); // remove leading '/'
                try {
                    const lspItems = await NetworkManager.getCompletions(filePath, position.lineNumber, position.column);
                    const suggestions = lspItems.map(item => ({
                        label: item.label,
                        kind: this._convertLspCompletionKind(item.kind),
                        insertText: item.insertText || item.label,
                        detail: item.detail,
                        documentation: item.documentation,
                        range: model.getWordUntilPosition(position) // A simple default range
                    }));
                    return { suggestions: suggestions };
                } catch (error) {
                    console.error('Code completion failed:', error);
                    return { suggestions: [] };
                }
            }
        });
    },

    _convertLspCompletionKind: function(kind) {
        // This is a simplified mapping
        const Kinds = monaco.languages.CompletionItemKind;
        switch (kind) {
            case 1: return Kinds.Text;
            case 2: return Kinds.Method;
            case 3: return Kinds.Function;
            case 4: return Kinds.Constructor;
            case 5: return Kinds.Field;
            case 6: return Kinds.Variable;
            case 7: return Kinds.Class;
            case 8: return Kinds.Interface;
            case 9: return Kinds.Module;
            case 10: return Kinds.Property;
            case 11: return Kinds.Unit;
            case 12: return Kinds.Value;
            case 13: return Kinds.Enum;
            case 14: return Kinds.Keyword;
            case 15: return Kinds.Snippet;
            case 16: return Kinds.Color;
            case 17: return Kinds.File;
            case 18: return Kinds.Reference;
            case 19: return Kinds.Folder;
            case 20: return Kinds.EnumMember;
            case 21: return Kinds.Constant;
            case 22: return Kinds.Struct;
            case 23: return Kinds.Event;
            case 24: return Kinds.Operator;
            case 25: return Kinds.TypeParameter;
            default: return Kinds.Text;
        }
    }
};

export default CodeEditorManager;