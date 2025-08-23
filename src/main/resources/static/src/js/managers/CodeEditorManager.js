// src/js/managers/CodeEditorManager.js - 代码编辑器核心管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import CompletionProviderService from '../services/CompletionProviderService.js';

/**
 * @description 管理 Monaco Editor 实例的所有方面，包括文件打开/关闭、
 * 标签页管理、内容保存、语法高亮、断点和设置应用。
 */
const CodeEditorManager = {
    monacoInstance: null,
    editorArea: null,
    monacoContainer: null,
    mediaPreviewContainer: null,
    tabBar: null,
    openFiles: new Map(),
    activeFilePath: null,
    debugDecorations: [],
    breakpointDecorations: [],

    KNOWN_TEXT_EXTENSIONS: new Set([
        'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'vue',
        'java', 'kt', 'gradle', 'py', 'rb', 'php', 'go', 'rs', 'r', 'c', 'cpp', 'h', 'cs',
        'xml', 'pom', 'json', 'jsonl', 'yml', 'yaml', 'toml', 'ini', 'conf', 'properties', 'env',
        'sh', 'bat', 'cmd', 'sql', 'dockerfile', 'docker', 'makefile', 'ignore', 'gitignore',
        'md', 'adoc', 'asciidoc', 'tex', 'rtf', 'svg', 'mml',
        'txt', 'log', 'csv', 'tsv',
        'proto', 'gltf',
        'ods', 'odt', 'epub', 'fb2', 'mhtml', 'pages'
    ]),

    KNOWN_MEDIA_EXTENSIONS: new Set([
        'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif',
        'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'flac'
    ]),

    /**
     * @description 初始化代码编辑器管理器。
     * @returns {Promise<void>}
     */
    init: async function() {
        this.editorArea = document.getElementById('editor-area');
        this.monacoContainer = document.getElementById('monaco-container');
        this.mediaPreviewContainer = document.getElementById('media-preview-container');
        this.tabBar = document.getElementById('editor-tab-bar');
        this._createMonacoInstance();
        this.bindAppEvents();
        await CompletionProviderService.init();
        EventBus.emit('log:info', '代码编辑器模块已初始化。');
    },

    /**
     * @description 创建并配置 Monaco Editor 实例。
     * @private
     */
    _createMonacoInstance: function() {
        if (!window.monaco) {
            EventBus.emit('log:error', 'Monaco Editor未能加载，代码编辑器无法初始化。');
            return;
        }
        this.monacoInstance = window.monaco.editor.create(this.monacoContainer, {
            value: '// 欢迎使用 Web IDEA！请从顶部选择一个项目，然后从左侧文件树中选择一个文件。\n',
            language: 'plaintext',
            theme: 'vs-dark', // 将由 ThemeManager 更新
            automaticLayout: true,
            fontSize: 14,
            wordWrap: 'on',
            glyphMargin: true,
        });

        this.monacoInstance.onDidChangeModelContent(() => this.handleContentChange());
        this.monacoInstance.onDidChangeCursorPosition((e) => this.handleCursorChange(e));

        this.monacoInstance.onMouseDown(function(e) {
            if (e.target.type === window.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position.lineNumber;
                this.toggleBreakpoint(this.activeFilePath, lineNumber);
            }
        }.bind(this));
    },

    /**
     * @description 绑定所有相关的应用事件。
     */
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
        EventBus.on('editor:insertSnippet', this.insertSnippet.bind(this));

        // ========================= 修改 START =========================
        // 这个事件现在由ActionManager在检查语言后触发，用于非Java文件
        EventBus.on('editor:formatDocument', () => this.monacoInstance?.getAction('editor.action.formatDocument').run());
        // ========================= 修改 END ===========================
        EventBus.on('editor:find', () => this.monacoInstance?.getAction('actions.find').run());
        EventBus.on('editor:duplicate-line', () => this.monacoInstance?.getAction('editor.action.copyLinesDownAction').run());
        EventBus.on('editor:delete-line', () => this.monacoInstance?.getAction('editor.action.deleteLines').run());
        EventBus.on('editor:toggle-line-comment', () => this.monacoInstance?.getAction('editor.action.commentLine').run());
        EventBus.on('editor:toggle-block-comment', () => this.monacoInstance?.getAction('editor.action.blockComment').run());
        EventBus.on('editor:move-line-up', () => this.monacoInstance?.getAction('editor.action.moveLinesUpAction').run());
        EventBus.on('editor:move-line-down', () => this.monacoInstance?.getAction('editor.action.moveLinesDownAction').run());
        EventBus.on('editor:expand-selection', () => this.monacoInstance?.getAction('editor.action.smartSelect.expand').run());
        EventBus.on('editor:shrink-selection', () => this.monacoInstance?.getAction('editor.action.smartSelect.shrink').run());
        EventBus.on('editor:show-goto-line', () => this.monacoInstance?.getAction('editor.action.gotoLine').run());
        EventBus.on('editor:insert-line-after', () => this.monacoInstance?.getAction('editor.action.insertLineAfter').run());
    },

    handleContentChange: function() {
        if (!this.activeFilePath) return;
        const fileInfo = this.openFiles.get(this.activeFilePath);
        if (fileInfo && fileInfo.type === 'editor' && !fileInfo.isDirty) {
            this._setFileDirty(this.activeFilePath, true);
        }
    },

    handleCursorChange: function(e) {
        if (!e.position) return;
        EventBus.emit('statusbar:updateCursorPos', {
            lineNumber: e.position.lineNumber,
            column: e.position.column
        });
    },

    handleProjectChange: function() {
        const openFilePaths = Array.from(this.openFiles.keys());
        openFilePaths.forEach(path => this.closeFile(path));
        this.breakpointDecorations = [];
    },

    openFile: async function(filePath) {
        // ========================= 关键修改 START =========================
        // 如果filePath为null或undefined，直接显示源不可用视图
        if (!filePath) {
            this._showSourceNotAvailable("未知文件", 0);
            return;
        }
        // ========================= 关键修改 END ===========================

        if (this.activeFilePath && this.openFiles.has(this.activeFilePath)) {
            const activeFileInfo = this.openFiles.get(this.activeFilePath);
            if (activeFileInfo.type === 'editor') {
                activeFileInfo.viewState = this.monacoInstance.saveViewState();
            }
        }

        if (this.openFiles.has(filePath)) {
            this.setActiveFile(filePath);
            return;
        }

        if (this._isMediaFile(filePath)) {
            await this._openMediaFile(filePath);
        } else if (this._isTextFile(filePath)) {
            await this._openTextFile(filePath);
        } else {
            EventBus.emit('log:info', `文件 '${filePath}' 被识别为二进制文件，将自动下载。`);
            EventBus.emit('context-action:download', { path: filePath });
        }
    },

    _openTextFile: async function(filePath) {
        try {
            const content = await NetworkManager.getFileContent(filePath);
            const language = this._getLanguageFromPath(filePath);
            const model = window.monaco.editor.createModel(content, language, window.monaco.Uri.parse(`file:///${filePath}`));
            const tabEl = this._createFileTab(filePath);

            this.openFiles.set(filePath, { type: 'editor', model, tabEl, isDirty: false, viewState: null });

            this.setActiveFile(filePath);
            EventBus.emit('log:info', `文件 '${filePath}' 已打开。`);
        } catch (error) {
            EventBus.emit('log:error', `打开文本文件 ${filePath} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '错误', message: `打开文件失败: ${error.message}` });
        }
    },

    _openMediaFile: async function(filePath) {
        try {
            const blob = await NetworkManager.downloadFileAsBlob(filePath);
            const objectUrl = URL.createObjectURL(blob);
            const previewElement = this._createMediaPreviewElement(filePath, objectUrl);
            const tabEl = this._createFileTab(filePath);

            this.openFiles.set(filePath, { type: 'media', tabEl, previewElement, objectUrl });

            this.setActiveFile(filePath);
            EventBus.emit('log:info', `媒体文件 '${filePath}' 已打开预览。`);
        } catch (error) {
            EventBus.emit('log:error', `预览媒体文件 ${filePath} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '错误', message: `预览文件失败: ${error.message}` });
        }
    },

    closeFile: function(filePath) {
        const fileInfo = this.openFiles.get(filePath);
        if (!fileInfo) return;

        if (fileInfo.type === 'editor') {
            window.monaco.editor.setModelMarkers(fileInfo.model, 'java-validator', []);
            fileInfo.model.dispose();
            this.breakpointDecorations = this.breakpointDecorations.filter(d => d.filePath !== filePath);
        } else if (fileInfo.type === 'media') {
            URL.revokeObjectURL(fileInfo.objectUrl);
            fileInfo.previewElement.remove();
        }

        fileInfo.tabEl.remove();
        this.openFiles.delete(filePath);

        if (this.activeFilePath === filePath) {
            this.activeFilePath = null;
            const remainingTabs = Array.from(this.tabBar.children);
            if (remainingTabs.length > 0) {
                const nextFilePath = remainingTabs[remainingTabs.length - 1].dataset.filePath;
                this.setActiveFile(nextFilePath);
            } else {
                this._showWelcomeView();
            }
        }
    },

    setActiveFile: function(filePath) {
        if (this.activeFilePath === filePath && this.activeFilePath !== null) return;

        if (this.activeFilePath && this.openFiles.has(this.activeFilePath)) {
            const oldFileInfo = this.openFiles.get(this.activeFilePath);
            oldFileInfo.tabEl.classList.remove('active');
            if (oldFileInfo.type === 'editor' && oldFileInfo.model) {
                oldFileInfo.viewState = this.monacoInstance.saveViewState();
            }
        }

        const fileInfo = this.openFiles.get(filePath);
        if (!fileInfo) {
            this._showWelcomeView();
            return;
        }
        fileInfo.tabEl.classList.add('active');

        if (fileInfo.type === 'editor') {
            this.mediaPreviewContainer.style.display = 'none';
            this.monacoContainer.style.display = 'block';
            this.monacoInstance.setModel(fileInfo.model);
            if (fileInfo.viewState) {
                this.monacoInstance.restoreViewState(fileInfo.viewState);
            }
            this.monacoInstance.focus();
            // ========================= 关键修改 START =========================
            // 确保切换回可编辑文件时，编辑器是可写的
            this.monacoInstance.updateOptions({ readOnly: false });
            // ========================= 关键修改 END ===========================
            const position = this.monacoInstance.getPosition() || { lineNumber: 1, column: 1 };
            EventBus.emit('statusbar:updateFileInfo', { path: filePath, language: this._getLanguageFromPath(filePath), ...position });
            this._setFileDirty(filePath, fileInfo.isDirty);
        } else if (fileInfo.type === 'media') {
            this.monacoContainer.style.display = 'none';
            this.mediaPreviewContainer.style.display = 'flex';
            this.mediaPreviewContainer.innerHTML = '';
            this.mediaPreviewContainer.appendChild(fileInfo.previewElement);
            fileInfo.previewElement.style.display = 'block';
            EventBus.emit('statusbar:updateFileInfo', { path: filePath, language: this._getLanguageFromPath(filePath), lineNumber: 1, column: 1 });
            this._setFileDirty(filePath, false);
        }

        this.activeFilePath = filePath;
    },

    toggleBreakpoint: function(filePath, lineNumber) {
        if (!filePath) return;

        const existingDecorationIndex = this.breakpointDecorations.findIndex(
            d => d.filePath === filePath && d.range.startLineNumber === lineNumber
        );

        const isEnabled = existingDecorationIndex === -1;

        NetworkManager.toggleBreakpoint(filePath, lineNumber, isEnabled)
            .then(() => {
                this.updateBreakpointDecorations(filePath, lineNumber, isEnabled);
                EventBus.emit('log:info', `断点已在 ${filePath.split('/').pop()}:${lineNumber} ${isEnabled ? '设置' : '移除'}`);
            })
            .catch(error => {
                EventBus.emit('log:error', `切换断点失败: ${error.message}`);
                EventBus.emit('modal:showAlert', { title: '断点错误', message: `无法切换断点: ${error.message}` });
            });
    },

    updateBreakpointDecorations: function(filePath, lineNumber, enabled) {
        const model = this.monacoInstance.getModel();
        if (!model || this.activeFilePath !== filePath) return;

        let existingDecorationIndex = -1;
        for (let i = 0; i < this.breakpointDecorations.length; i++) {
            const d = this.breakpointDecorations[i];
            if (d && d.filePath === filePath && d.range.startLineNumber === lineNumber) {
                existingDecorationIndex = i;
                break;
            }
        }

        const oldDecorationIds = existingDecorationIndex !== -1 ? [this.breakpointDecorations[existingDecorationIndex].id] : [];

        const newDecorationConfig = enabled ? [{
            range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
                isWholeLine: false,
                glyphMarginClassName: 'breakpoint-decorator',
                stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            }
        }] : [];

        const newDecorationIds = this.monacoInstance.deltaDecorations(oldDecorationIds, newDecorationConfig);

        if (existingDecorationIndex !== -1) {
            this.breakpointDecorations.splice(existingDecorationIndex, 1);
        }

        if (newDecorationIds.length > 0) {
            this.breakpointDecorations.push({
                id: newDecorationIds[0],
                range: newDecorationConfig[0].range,
                options: newDecorationConfig[0].options,
                filePath: filePath
            });
        }
    },

    saveActiveFile: async function() {
        if (!this.activeFilePath || !this.openFiles.has(this.activeFilePath)) {
            EventBus.emit('log:warn', '没有活动文件可供保存。');
            return;
        }

        const fileInfo = this.openFiles.get(this.activeFilePath);
        if (fileInfo.type === 'media') {
            EventBus.emit('statusbar:updateStatus', '媒体文件无需保存', 1500);
            return;
        }
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
            EventBus.emit('file:saved', this.activeFilePath);
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

        tab.addEventListener('click', function(e) {
            if (e.target.classList.contains('close-tab-btn')) {
                e.stopPropagation();
                this.closeFile(filePath);
            } else {
                this.setActiveFile(filePath);
            }
        }.bind(this));

        tab.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            this.setActiveFile(filePath);
            EventBus.emit('ui:showContextMenu', {
                x: e.clientX,
                y: e.clientY,
                item: { filePath },
                type: 'editor-tab'
            });
        }.bind(this));

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

    _showWelcomeView: function() {
        this.monacoContainer.style.display = 'block';
        this.mediaPreviewContainer.style.display = 'none';
        this.monacoInstance.setModel(null);
        // ========================= 关键修改 START =========================
        this.monacoInstance.setValue('// 没有打开的文件');
        this.monacoInstance.updateOptions({ readOnly: true }); // 在欢迎视图中设为只读
        // ========================= 关键修改 END ===========================
        EventBus.emit('statusbar:clearFileInfo');
    },

    _createMediaPreviewElement: function(filePath, objectUrl) {
        const ext = filePath.split('.').pop().toLowerCase();
        let element;

        if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif'].includes(ext)) {
            element = document.createElement('img');
        } else {
            element = document.createElement('video');
            element.controls = true;
            element.autoplay = false;
        }

        element.src = objectUrl;
        element.className = 'media-preview';
        element.style.display = 'none';
        return element;
    },

    _isMediaFile: function(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        return this.KNOWN_MEDIA_EXTENSIONS.has(ext);
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
        if (!ext || filePath.endsWith('.')) return true;
        return this.KNOWN_TEXT_EXTENSIONS.has(ext);
    },

    _getLanguageFromPath: function(filePath) {
        if (!filePath) return 'plaintext';
        const ext = filePath.split('.').pop().toLowerCase();
        if (this._isMediaFile(filePath)) return 'Media';
        switch (ext) {
            case 'js': case 'jsx': return 'javascript';
            case 'ts': case 'tsx': return 'typescript';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'java': return 'java';
            case 'py': return 'python';
            case 'xml': case 'pom': return 'xml';
            case 'json': return 'json';
            case 'md': return 'markdown';
            default: return 'plaintext';
        }
    },

    getActiveLanguage: function() {
        return this._getLanguageFromPath(this.activeFilePath);
    },

    resizeEditor: function() {
        this.monacoInstance?.layout();
    },

    gotoLine: function({ filePath, lineNumber }) {
        const openAndReveal = () => {
            const fileInfo = this.openFiles.get(filePath);
            if (fileInfo && fileInfo.type === 'editor') {
                this.monacoInstance.setPosition({ lineNumber, column: 1 });
                this.monacoInstance.revealLineInCenter(lineNumber);
                this.monacoInstance.focus();
            }
        };
        if (this.activeFilePath !== filePath) {
            this.openFile(filePath).then(openAndReveal);
        } else {
            openAndReveal();
        }
    },

    highlightDebugLine: function({ filePath, fileName, lineNumber }) {
        this.clearDebugHighlight();
        // ========================= 关键修改 START =========================
        if (filePath) {
            // 这是项目内的文件
            this.gotoLine({ filePath, lineNumber });
            this.debugDecorations = this.monacoInstance.deltaDecorations([], [{
                range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                    isWholeLine: true,
                    className: 'debug-line-highlight',
                    linesDecorationsClassName: 'debug-line-decorator-gutter'
                }
            }]);
        } else {
            // 这是JDK或外部库的文件
            this._showSourceNotAvailable(fileName, lineNumber);
        }
        // ========================= 关键修改 END ===========================
    },

    clearDebugHighlight: function() {
        if (this.monacoInstance && this.debugDecorations) {
            this.debugDecorations = this.monacoInstance.deltaDecorations(this.debugDecorations, []);
        }
    },

    setTheme: function(theme) {
        if (window.monaco) {
            const monacoTheme = theme.includes('dark') ? 'vs-dark' : 'light';
            window.monaco.editor.setTheme(monacoTheme);
        }
    },

    applySettings: function(settings) {
        if (!this.monacoInstance || !settings) return;
        this.monacoInstance.updateOptions({
            fontSize: settings.fontSize,
            wordWrap: settings.wordWrap ? 'on' : 'off',
            fontFamily: settings.editorFontFamily || 'JetBrains Mono',
        });
    },

    insertSnippet: function(template) {
        if (!this.monacoInstance) return;
        const fileInfo = this.openFiles.get(this.activeFilePath);
        if (fileInfo && fileInfo.type === 'editor') {
            this.monacoInstance.getContribution('snippetController2').insert(template);
        }
    },

    // ========================= 关键修改 START =========================
    /**
     * 在编辑器区域显示“源文件不可用”的消息。
     * @param {string} fileName - 不可用的文件名。
     * @param {number} lineNumber - 程序暂停的行号。
     * @private
     */
    _showSourceNotAvailable: function(fileName, lineNumber) {
        // 确保没有标签页被视为活动
        if (this.activeFilePath && this.openFiles.has(this.activeFilePath)) {
            this.openFiles.get(this.activeFilePath).tabEl.classList.remove('active');
        }
        this.activeFilePath = null;

        this.monacoContainer.style.display = 'block';
        this.mediaPreviewContainer.style.display = 'none';

        // 卸载当前模型，并显示提示信息
        this.monacoInstance.setModel(null);
        this.monacoInstance.setValue(
            `// 源文件 "${fileName}" 不可用。\n` +
            `// 调试器已暂停在第 ${lineNumber} 行。\n\n` +
            `// 您可以使用 "步出 (Shift+F8)" 返回到您自己的代码中。`
        );
        this.monacoInstance.updateOptions({ readOnly: true });

        // 更新状态栏
        EventBus.emit('statusbar:updateFileInfo', {
            path: `[外部源码] ${fileName}`,
            language: 'Java (Decompiled)',
            lineNumber: lineNumber,
            column: 1
        });
    }
    // ========================= 关键修改 END ===========================
};

export default CodeEditorManager;