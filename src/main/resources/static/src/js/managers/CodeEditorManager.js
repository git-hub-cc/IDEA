// src/js/managers/CodeEditorManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import SimpleJavaValidator from '../analysis/SimpleJavaValidator.js';
import { debounce } from '../utils/debounce.js';
import CompletionProviderService from '../services/CompletionProviderService.js';


const CodeEditorManager = {
    monacoInstance: null,
    editorArea: null,
    tabBar: null,
    openFiles: new Map(), // Map<filePath, { model, tabEl, isDirty, viewState }>
    activeFilePath: null,
    debugDecorations: [],
    breakpointDecorations: [],
    debouncedAnalysis: null,

    // 移除了 cstCache

    KNOWN_TEXT_EXTENSIONS: new Set([
        'java', 'js', 'html', 'css', 'vue', 'xml', 'pom', 'json', 'md',
        'txt', 'gitignore', 'properties', 'yml', 'yaml', 'sql', 'sh', 'bat'
    ]),

    init: async function() {
        this.editorArea = document.getElementById('editor-area');
        this.tabBar = document.getElementById('editor-tab-bar');

        this.debouncedAnalysis = debounce(this.triggerAnalysis.bind(this), 500);

        this._createMonacoInstance();
        this.bindAppEvents();

        // 初始化并注册代码片段自动补全服务
        await CompletionProviderService.init();

        EventBus.emit('log:info', '代码编辑器模块已初始化。');
    },

    _createMonacoInstance: function() {
        if (!window.monaco) {
            EventBus.emit('log:error', 'Monaco Editor未能加载，代码编辑器无法初始化。');
            return;
        }
        this.monacoInstance = window.monaco.editor.create(this.editorArea, {
            value: '// 欢迎使用 Web IDEA！请从顶部选择一个项目，然后从左侧文件树中选择一个文件。\n',
            language: 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            wordWrap: 'on',
            glyphMargin: true,
        });

        this.monacoInstance.onDidChangeModelContent(() => this.handleContentChange());
        this.monacoInstance.onDidChangeCursorPosition((e) => this.handleCursorChange(e));

        // 为断点添加事件监听器 (移除了 Ctrl+Click 跳转)
        this.monacoInstance.onMouseDown((e) => {
            if (e.target.type === window.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position.lineNumber;
                this.toggleBreakpoint(this.activeFilePath, lineNumber);
            }
        });

        // 移除了 F12 跳转动作
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
        EventBus.on('project:activated', this.handleProjectChange.bind(this));
        EventBus.on('editor:closeOtherTabs', this.closeOtherTabs.bind(this));
        EventBus.on('editor:closeTabsToTheRight', this.closeTabsToTheRight.bind(this));
        EventBus.on('editor:closeTabsToTheLeft', this.closeTabsToTheLeft.bind(this));

        // 监听分析结果事件
        EventBus.on('analysis:results', this.handleAnalysisResults.bind(this));
        // 监听插入代码片段的请求
        EventBus.on('editor:insertSnippet', this.insertSnippet.bind(this));

        // 响应格式化和查找的动作
        EventBus.on('editor:formatDocument', () => this.monacoInstance?.getAction('editor.action.formatDocument').run());
        EventBus.on('editor:find', () => this.monacoInstance?.getAction('actions.find').run());

        // 新增快捷键事件监听
        EventBus.on('editor:duplicate-line', () => this.monacoInstance?.getAction('editor.action.copyLinesDownAction').run());
        EventBus.on('editor:delete-line', () => this.monacoInstance?.getAction('editor.action.deleteLines').run());
        EventBus.on('editor:toggle-line-comment', () => this.monacoInstance?.getAction('editor.action.commentLine').run());
        EventBus.on('editor:toggle-block-comment', () => this.monacoInstance?.getAction('editor.action.blockComment').run());
        EventBus.on('editor:move-line-up', () => this.monacoInstance?.getAction('editor.action.moveLinesUpAction').run());
        EventBus.on('editor:move-line-down', () => this.monacoInstance?.getAction('editor.action.moveLinesDownAction').run());
        EventBus.on('editor:expand-selection', () => this.monacoInstance?.getAction('editor.action.smartSelect.expand').run());
        EventBus.on('editor:shrink-selection', () => this.monacoInstance?.getAction('editor.action.smartSelect.shrink').run());
        // 移除了 editor:goto-definition
        EventBus.on('editor:show-goto-line', () => this.monacoInstance?.getAction('editor.action.gotoLine').run());

        // 响应指令面板获取当前语言的请求
        EventBus.on('editor:getActiveLanguage', () => this._getLanguageFromPath(this.activeFilePath));
    },

    handleProjectChange: function() {
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

            this.triggerAnalysis();
        } catch (error) {
            EventBus.emit('log:error', `打开文件 ${filePath} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '错误', message: `打开文件失败: ${error.message}` });
        }
    },

    // ... (saveActiveFile, _createFileTab, closeOtherTabs, etc. 保持不变) ...
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

        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.setActiveFile(filePath);
            EventBus.emit('ui:showContextMenu', {
                x: e.clientX,
                y: e.clientY,
                item: { filePath },
                type: 'editor-tab'
            });
        });

        this.tabBar.appendChild(tab);
        return tab;
    },

    closeOtherTabs: function(filePathToKeep) {
        const pathsToClose = Array.from(this.openFiles.keys()).filter(p => p !== filePathToKeep);
        pathsToClose.forEach(p => this.closeFile(p));
    },

    closeTabsToTheRight: function(referenceFilePath) {
        const allTabs = Array.from(this.tabBar.children);
        const refIndex = allTabs.findIndex(tab => tab.dataset.filePath === referenceFilePath);
        if (refIndex === -1) return;

        for (let i = refIndex + 1; i < allTabs.length; i++) {
            this.closeFile(allTabs[i].dataset.filePath);
        }
    },

    closeTabsToTheLeft: function(referenceFilePath) {
        const allTabs = Array.from(this.tabBar.children);
        const refIndex = allTabs.findIndex(tab => tab.dataset.filePath === referenceFilePath);
        if (refIndex === -1) return;

        for (let i = 0; i < refIndex; i++) {
            this.closeFile(allTabs[i].dataset.filePath);
        }
    },

    closeFile: function(filePath) {
        const fileInfo = this.openFiles.get(filePath);
        if (!fileInfo) return;

        // 清理资源
        window.monaco.editor.setModelMarkers(fileInfo.model, 'java-validator', []);
        fileInfo.model.dispose();
        fileInfo.tabEl.remove();
        this.openFiles.delete(filePath);

        EventBus.emit('problems:clearForFile', filePath);

        if (this.activeFilePath === filePath) {
            this.activeFilePath = null;
            const remainingTabs = Array.from(this.tabBar.children);
            if (remainingTabs.length > 0) {
                const nextFilePath = remainingTabs[remainingTabs.length - 1].dataset.filePath;
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

    handleContentChange: function() {
        if (this.activeFilePath) {
            this._setFileDirty(this.activeFilePath, true);
            this.debouncedAnalysis();
        }
    },

    handleCursorChange: function(e) {
        if (this.activeFilePath) {
            EventBus.emit('statusbar:updateCursorPos', e.position);
        }
    },

    // ... (toggleBreakpoint, updateBreakpointDecorations, etc. 保持不变) ...
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
        if (!model || model.uri.path.substring(1) !== filePath) return;

        let newDecorations = [];
        const oldDecorations = this.breakpointDecorations.filter(d => {
            const isSameLine = d.range.startLineNumber === lineNumber;
            if (!isSameLine) newDecorations.push(d);
            return isSameLine;
        });

        const newDecorationConfig = enabled ? [{
            range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
                isWholeLine: false,
                glyphMarginClassName: 'breakpoint-decorator',
                stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            }
        }] : [];

        this.breakpointDecorations = this.monacoInstance.deltaDecorations(oldDecorations.map(d => d.id), newDecorationConfig);
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
        if (!filePath) return 'plaintext';
        const ext = filePath.split('.').pop().toLowerCase();
        switch (ext) {
            case 'java': return 'java';
            case 'js': return 'javascript';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'vue': return 'vue';
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
            const monacoTheme = theme.includes('dark') ? 'vs-dark' : 'light';
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

    triggerAnalysis: function() {
        if (!this.activeFilePath || !this.openFiles.has(this.activeFilePath)) return;

        const fileInfo = this.openFiles.get(this.activeFilePath);
        const code = fileInfo.model.getValue();
        const language = this._getLanguageFromPath(this.activeFilePath);

        // 只对 Java 文件进行自定义校验
        if (language === 'java') {
            const errors = SimpleJavaValidator.validate(code);
            // 直接将结果发送给自身和其他监听器
            EventBus.emit('analysis:results', {
                filePath: this.activeFilePath,
                errors: errors
            });
        } else {
            // 对其他语言，可以清空问题或依赖Monaco内置的linter
            EventBus.emit('analysis:results', {
                filePath: this.activeFilePath,
                errors: []
            });
        }
    },

    handleAnalysisResults: function({ filePath, errors }) {
        const fileInfo = this.openFiles.get(filePath);
        if (!fileInfo) return;

        const model = fileInfo.model;
        const markers = errors.map(err => ({
            message: err.message,
            severity: window.monaco.MarkerSeverity.Error,
            startLineNumber: err.startLineNumber,
            startColumn: err.startColumn,
            endLineNumber: err.endLineNumber,
            endColumn: err.endColumn,
            source: 'java-validator', // 标记来源为我们的新校验器
        }));

        window.monaco.editor.setModelMarkers(model, 'java-validator', markers);

        EventBus.emit('problems:update', { filePath, problems: errors });
    },

    insertSnippet: function(template) {
        if (!this.monacoInstance) return;
        this.monacoInstance.getContribution('snippetController2').insert(template);
    },

    // 移除了 gotoDefinition 方法
};

export default CodeEditorManager;