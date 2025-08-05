// src/js/managers/CodeEditorManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import CompletionProviderService from '../services/CompletionProviderService.js';

const CodeEditorManager = {
    monacoInstance: null,
    editorArea: null,
    monacoContainer: null,
    mediaPreviewContainer: null,
    tabBar: null,
    openFiles: new Map(), // Map<filePath, { type, model?, tabEl, isDirty, viewState?, previewElement?, objectUrl? }>
    activeFilePath: null,
    debugDecorations: [],
    breakpointDecorations: [], // Stores { id, range, options, filePath }

    // ========================= 关键修改 START: 扩展已知文本文件类型 =========================
    // 优化后的列表，包含更多文本格式并排除了不合适的二进制格式
    KNOWN_TEXT_EXTENSIONS: new Set([
        // Core Web & Scripting
        'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'vue',
        // Backend & Systems
        'java', 'kt', 'gradle', 'py', 'rb', 'php', 'go', 'rs', 'r', 'c', 'cpp', 'h', 'cs',
        // Config & Data
        'xml', 'pom', 'json', 'jsonl', 'yml', 'yaml', 'toml', 'ini', 'conf', 'properties', 'env',
        // Shell & Build
        'sh', 'bat', 'cmd', 'sql', 'dockerfile', 'docker', 'makefile', 'ignore', 'gitignore',
        // Markup & Docs
        'md', 'adoc', 'asciidoc', 'tex', 'rtf', 'svg', 'mml',
        // Plain Text & Logs
        'txt', 'log', 'csv', 'tsv',
        // Data Formats (Text-based)
        'proto', 'gltf',
        // Document formats that can be viewed as text
        'ods', 'odt', 'epub', 'fb2', 'mhtml', 'pages'
    ]),
    // ========================= 关键修改 END ==========================================

    KNOWN_MEDIA_EXTENSIONS: new Set([
        'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif',
        'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'flac'
    ]),


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

    _createMonacoInstance: function() {
        if (!window.monaco) {
            EventBus.emit('log:error', 'Monaco Editor未能加载，代码编辑器无法初始化。');
            return;
        }
        this.monacoInstance = window.monaco.editor.create(this.monacoContainer, {
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

        this.monacoInstance.onMouseDown((e) => {
            if (e.target.type === window.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                const lineNumber = e.target.position.lineNumber;
                this.toggleBreakpoint(this.activeFilePath, lineNumber);
            }
        });
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
        EventBus.on('editor:insertSnippet', this.insertSnippet.bind(this));
        EventBus.on('editor:formatDocument', () => this.monacoInstance?.getAction('editor.action.formatDocument').run());
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
            } else if (oldFileInfo.type === 'media') {
                oldFileInfo.previewElement.style.display = 'none';
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
            const position = this.monacoInstance.getPosition() || { lineNumber: 1, column: 1 };
            EventBus.emit('statusbar:updateFileInfo', { path: filePath, language: this._getLanguageFromPath(filePath), ...position });
            this._setFileDirty(filePath, fileInfo.isDirty);
        } else if (fileInfo.type === 'media') {
            this.monacoContainer.style.display = 'none';
            this.mediaPreviewContainer.style.display = 'flex';
            this.mediaPreviewContainer.innerHTML = ''; // Clear previous media
            this.mediaPreviewContainer.appendChild(fileInfo.previewElement);
            fileInfo.previewElement.style.display = 'block';
            EventBus.emit('statusbar:updateFileInfo', { path: filePath, language: this._getLanguageFromPath(filePath), lineNumber: 1, column: 1 });
            this._setFileDirty(filePath, false);
        }

        this.activeFilePath = filePath;
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

    _showWelcomeView: function() {
        this.monacoContainer.style.display = 'block';
        this.mediaPreviewContainer.style.display = 'none';
        this.monacoInstance.setModel(null);
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

    // ========================= 关键修改 START: 扩展语言映射 =========================
    _getLanguageFromPath: function(filePath) {
        if (!filePath) return 'plaintext';
        const ext = filePath.split('.').pop().toLowerCase();

        if (this._isMediaFile(filePath)) {
            if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif'].includes(ext)) return 'Image';
            if (['mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'flac'].includes(ext)) return 'Video/Audio';
            return 'Media';
        }

        switch (ext) {
            // Web
            case 'js': case 'jsx': return 'javascript';
            case 'ts': case 'tsx': return 'typescript';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'scss': return 'scss';
            case 'less': return 'less';
            case 'vue': return 'vue';
            case 'svg': return 'svg';

            // Java & JVM
            case 'java': return 'java';
            case 'kt': return 'kotlin';
            case 'gradle': return 'groovy';

            // Other Languages
            case 'py': return 'python';
            case 'rb': return 'ruby';
            case 'php': return 'php';
            case 'c': return 'c';
            case 'h': case 'cpp': return 'cpp';
            case 'cs': return 'csharp';
            case 'go': return 'go';
            case 'rs': return 'rust';
            case 'r': return 'r';

            // Config & Data
            case 'xml': case 'pom': return 'xml';
            case 'json': case 'jsonl': case 'gltf': return 'json';
            case 'yml': case 'yaml': return 'yaml';
            case 'toml': return 'toml';
            case 'ini': case 'properties': case 'conf': case 'env': return 'ini';
            case 'proto': return 'protobuf';

            // Shell & SQL
            case 'sh': return 'shell';
            case 'bat': case 'cmd': return 'bat';
            case 'sql': return 'sql';
            case 'dockerfile': case 'docker': return 'dockerfile';
            case 'makefile': return 'makefile';

            // Markup
            case 'md': case 'adoc': case 'asciidoc': return 'markdown';

            // Default to plaintext for known text but unhighlighted files
            case 'gitignore': case 'ignore':
            case 'log': case 'txt': case 'csv': case 'tsv':
            case 'tex': case 'rtf': case 'mml': case 'ods': case 'odt':
            case 'epub': case 'fb2': case 'mhtml': case 'pages':
            default: return 'plaintext';
        }
    },
    // ========================= 关键修改 END ======================================

    getActiveLanguage: function() {
        return this._getLanguageFromPath(this.activeFilePath);
    },

    resizeEditor: function() { this.monacoInstance?.layout(); },

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

    insertSnippet: function(template) {
        if (!this.monacoInstance) return;
        const fileInfo = this.openFiles.get(this.activeFilePath);
        if (fileInfo && fileInfo.type === 'editor') {
            this.monacoInstance.getContribution('snippetController2').insert(template);
        }
    },
};

export default CodeEditorManager;