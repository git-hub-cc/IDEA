// src/js/managers/CodeEditorManager.js

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

    KNOWN_TEXT_EXTENSIONS: new Set([
        'java', 'js', 'html', 'css', 'xml', 'pom', 'json', 'md',
        'txt', 'gitignore', 'properties', 'yml', 'yaml', 'sql', 'sh', 'bat'
    ]),

    init: function() {
        // ... (init aunchanged)
        return new Promise((resolve) => {
            this.editorArea = document.getElementById('editor-area');
            this.tabBar = document.getElementById('editor-tab-bar');

            this._createMonacoInstance();
            this.bindAppEvents();

            EventBus.emit('log:info', '代码编辑器模块已初始化。');
            resolve();
        });
    },

    // ... (_createMonacoInstance unchanged)
    _createMonacoInstance: function() {
        if (!window.monaco) {
            EventBus.emit('log:error', 'Monaco Editor未能加载，代码编辑器无法初始化。');
            return;
        }
        this.monacoInstance = window.monaco.editor.create(this.editorArea, {
            value: '// 欢迎使用 Web IDEA！请从顶部选择一个项目，然后从左侧文件树中选择一个文件。',
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
        EventBus.on('project:activated', this.handleProjectChange.bind(this));
        // ========================= 关键修改 START =========================
        EventBus.on('editor:closeOtherTabs', this.closeOtherTabs.bind(this));
        EventBus.on('editor:closeTabsToTheRight', this.closeTabsToTheRight.bind(this));
        EventBus.on('editor:closeTabsToTheLeft', this.closeTabsToTheLeft.bind(this));
        // ========================= 关键修改 END ===========================
    },

    // ... (handleProjectChange, openFile, saveActiveFile aunchanged)
    handleProjectChange: function() {
        // 当项目改变时，关闭所有打开的文件
        const openFilePaths = Array.from(this.openFiles.keys());
        openFilePaths.forEach(path => this.closeFile(path));
    },

    openFile: async function(filePath) {
        if (!this._isTextFile(filePath)) {
            EventBus.emit('log:info', `文件 '${filePath}' 被识别为二进制文件，将自动下载。`);
            EventBus.emit('context-action:download', { path: filePath });
            return;
        }

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

        // ========================= 关键修改 START =========================
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.setActiveFile(filePath); // 确保右键点击的tab是活动的
            EventBus.emit('ui:showContextMenu', {
                x: e.clientX,
                y: e.clientY,
                item: { filePath }, // 传递上下文信息
                type: 'editor-tab'  // 指定菜单类型
            });
        });
        // ========================= 关键修改 END ===========================

        this.tabBar.appendChild(tab);
        return tab;
    },

    // ========================= 关键修改 START =========================
    /**
     * @description 关闭除指定文件外的所有其他标签页。
     * @param {string} filePathToKeep - 要保留的文件的路径。
     */
    closeOtherTabs: function(filePathToKeep) {
        const pathsToClose = Array.from(this.openFiles.keys()).filter(p => p !== filePathToKeep);
        pathsToClose.forEach(p => this.closeFile(p));
    },

    /**
     * @description 关闭指定文件右侧的所有标签页。
     * @param {string} referenceFilePath - 参考文件的路径。
     */
    closeTabsToTheRight: function(referenceFilePath) {
        const allPaths = Array.from(this.openFiles.keys());
        const referenceIndex = allPaths.indexOf(referenceFilePath);
        if (referenceIndex === -1) return;

        const pathsToClose = allPaths.slice(referenceIndex + 1);
        pathsToClose.forEach(p => this.closeFile(p));
    },

    /**
     * @description 关闭指定文件左侧的所有标签页。
     * @param {string} referenceFilePath - 参考文件的路径。
     */
    closeTabsToTheLeft: function(referenceFilePath) {
        const allPaths = Array.from(this.openFiles.keys());
        const referenceIndex = allPaths.indexOf(referenceFilePath);
        if (referenceIndex === -1) return;

        const pathsToClose = allPaths.slice(0, referenceIndex);
        pathsToClose.forEach(p => this.closeFile(p));
    },
    // ========================= 关键修改 END ===========================

    // ... (其他方法保持不变)
    closeFile: function(filePath) {
        const fileInfo = this.openFiles.get(filePath);
        if (!fileInfo) return;

        fileInfo.model.dispose();
        fileInfo.tabEl.remove();
        this.openFiles.delete(filePath);
        window.monaco.editor.setModelMarkers(fileInfo.model, 'owner', []);

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
        if (model.uri.path.substring(1) !== filePath) return;

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
    _isTextFile: function(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        return this.KNOWN_TEXT_EXTENSIONS.has(ext);
    },
    _getLanguageFromPath: function(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
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
        this.clearDebugHighlight();
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
    updateDiagnostics: function({ filePath, diagnostics }) {
        const model = window.monaco.editor.getModels().find(m => m.uri.path.substring(1) === filePath);
        if (!model) return;

        const markers = diagnostics.map(d => ({
            message: d.message,
            severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
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
                const filePath = model.uri.path.substring(1);
                try {
                    const lspItems = await NetworkManager.getCompletions(filePath, position.lineNumber, position.column);
                    const suggestions = lspItems.map(item => ({
                        label: item.label,
                        kind: this._convertLspCompletionKind(item.kind),
                        insertText: item.insertText || item.label,
                        detail: item.detail,
                        documentation: item.documentation,
                        range: model.getWordUntilPosition(position)
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
        const Kinds = monaco.languages.CompletionItemKind;
        switch (kind) {
            case 1: return Kinds.Text; case 2: return Kinds.Method; case 3: return Kinds.Function;
            case 4: return Kinds.Constructor; case 5: return Kinds.Field; case 6: return Kinds.Variable;
            case 7: return Kinds.Class; case 8: return Kinds.Interface; case 9: return Kinds.Module;
            case 10: return Kinds.Property; case 11: return Kinds.Unit; case 12: return Kinds.Value;
            case 13: return Kinds.Enum; case 14: return Kinds.Keyword; case 15: return Kinds.Snippet;
            case 16: return Kinds.Color; case 17: return Kinds.File; case 18: return Kinds.Reference;
            case 19: return Kinds.Folder; case 20: return Kinds.EnumMember; case 21: return Kinds.Constant;
            case 22: return Kinds.Struct; case 23: return Kinds.Event; case 24: return Kinds.Operator;
            case 25: return Kinds.TypeParameter; default: return Kinds.Text;
        }
    }
};

export default CodeEditorManager;