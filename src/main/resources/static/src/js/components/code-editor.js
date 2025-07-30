// code-editor.js - 代码编辑器组件逻辑 (Monaco集成)
export class CodeEditor {
    constructor(editorAreaId, tabBarId, eventBus) {
        this.editorArea = document.getElementById(editorAreaId);
        this.tabBar = document.getElementById(tabBarId);
        this.eventBus = eventBus;
        this.monacoInstance = null;
        this.openFiles = new Map(); // Map<filePath, { model, editorTab, isDirty }>
        this.activeFilePath = null;
        this.debugDecorations = []; // 存储调试行高亮装饰器
    }

    // 初始化Monaco Editor
    async initMonaco() {
        // 等待 requirejs 加载 Monaco Editor 核心模块
        await new Promise(resolve => {
            // Monaco Loader 的 require 会异步加载并执行 'vs/editor/editor.main'
            // 确保 monaco 对象在全局可用
            if (window.monaco && window.monaco.editor) {
                resolve(window.monaco);
            } else {
                // 如果没有，等待 require 完成加载
                const checkMonacoInterval = setInterval(() => {
                    if (window.monaco && window.monaco.editor) {
                        clearInterval(checkMonacoInterval);
                        resolve(window.monaco);
                    }
                }, 100); // 每100ms检查一次
            }
        });

        // Monaco Editor 核心已加载，可以安全地创建实例
        this._createMonacoInstance(window.monaco);
    }

    _createMonacoInstance(monaco) {
        this.monacoInstance = monaco.editor.create(this.editorArea, {
            value: '// Welcome to Web IDEA! Select a file from the project tree.',
            language: 'plaintext',
            theme: 'vs-dark', // 默认深色主题
            automaticLayout: true, // 自动适应父容器大小
            minimap: { enabled: true }, // 小地图默认开启
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 4,
            // 更多Monaco配置...
        });
        window.monacoEditorInstance = this.monacoInstance; // 暴露给全局，方便UI Manager调用layout
        this.setupMonacoEventListeners();
        this.setupCodeCompletion(); // 注册代码补全
    }

    // 设置Monaco Editor事件监听器
    setupMonacoEventListeners() {
        this.monacoInstance.onDidChangeCursorPosition((e) => {
            this.eventBus.emit('editorCursorChange', e.position);
        });

        this.monacoInstance.onDidChangeModelContent(() => {
            if (this.activeFilePath) {
                this.markFileModified(this.activeFilePath, true);
                this.eventBus.emit('editorContentChange', this.monacoInstance.getModel());
            }
        });
    }

    // 注册Java代码补全
    setupCodeCompletion() {
        // 确保 monaco 对象已定义
        if (!window.monaco) {
            console.warn("Monaco object not available for code completion registration.");
            return;
        }

        window.monaco.languages.registerCompletionItemProvider('java', {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions = [];

                // 1. Live Templates (代码片段)
                suggestions.push(
                    {
                        label: 'psvm', // 缩写
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'public static void main(String[] args) {\n\t$0\n}', // $0 是最终光标位置
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'public static void main(String[] args) method',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'sout',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'System.out.println($0);',
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'System.out.println()',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'serr',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'System.err.println($0);',
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'System.err.println()',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'fori',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:limit}; ${1:i}++) {\n\t$0\n}', // $1, $2 是可切换的占位符
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Iterate with index',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'iter',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'for (${1:Type} ${2:element} : ${3:collection}) {\n\t$0\n}',
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Iterate over collection',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'ifn',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'if (${1:expr} == null) {\n\t$0\n}',
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'if (expr == null)',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'inn',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'if (${1:expr} != null) {\n\t$0\n}',
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'if (expr != null)',
                        detail: 'Live Template',
                        range: range,
                    },
                    {
                        label: 'tryc',
                        kind: window.monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'try {\n\t$0\n} catch (${1:Exception} ${2:e}) {\n\t// TODO: handle exception\n}',
                        insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'try-catch block',
                        detail: 'Live Template',
                        range: range,
                    }
                );

                // 2. Java 关键字
                suggestions.push(
                    ...[
                        'public', 'private', 'protected', 'class', 'interface', 'abstract', 'void', 'static', 'final', 'new', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'return', 'this', 'super', 'extends', 'implements', 'true', 'false', 'null',
                        'int', 'long', 'short', 'byte', 'float', 'double', 'char', 'boolean', 'String', 'Integer', 'Double', 'Boolean', 'List', 'Map', 'Set', 'ArrayList', 'HashMap', 'HashSet' // 常见类型
                    ].map(keyword => ({
                        label: keyword,
                        kind: window.monaco.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range: range,
                    }))
                );

                // 3. 模拟上下文感知补全 (基于当前文件简单文本分析)
                const currentFileContent = model.getValue();
                const identifiers = new Set();
                const wordRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
                let match;
                while ((match = wordRegex.exec(currentFileContent)) !== null) {
                    identifiers.add(match[0]);
                }

                // 添加非关键字的标识符作为Text补全项
                identifiers.forEach(identifier => {
                    if (!suggestions.some(s => s.label === identifier)) { // 避免重复
                        suggestions.push({
                            label: identifier,
                            kind: window.monaco.languages.CompletionItemKind.Text,
                            insertText: identifier,
                            range: range,
                            detail: 'Local Symbol (Simulated)'
                        });
                    }
                });

                // 模拟 System.out.println 等
                const lineContent = model.getLineContent(position.lineNumber);
                if (lineContent.substring(0, position.column).endsWith('System.out.')) {
                    suggestions.push(
                        {
                            label: 'println',
                            kind: window.monaco.languages.CompletionItemKind.Method,
                            insertText: 'println($0);',
                            insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            documentation: 'Prints a line to the console.',
                            range: range,
                        },
                        {
                            label: 'print',
                            kind: window.monaco.languages.CompletionItemKind.Method,
                            insertText: 'print($0);',
                            insertTextRules: window.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            documentation: 'Prints to the console.',
                            range: range,
                        }
                    );
                }


                return { suggestions: suggestions };
            },
        });
    }

    // 模拟代码诊断 (语法检查与警告)
    simulateDiagnostics(model) {
        if (!model) return;
        const filePath = model.uri.path.substring(1); // 从Monaco URI获取路径
        const content = model.getValue();
        const markers = [];

        // 模拟：未声明的变量 (简单匹配以'my'开头的，且不在预定义关键字或常见类型中的词汇)
        const unDeclaredVarRegex = /\b(my[A-Za-z0-9_]+)\b(?![\(.'"])/g; // 匹配以my开头，后面不是括号、点、引号的词
        let match;
        while ((match = unDeclaredVarRegex.exec(content)) !== null) {
            const word = match[1];
            // 简单判断是否是常见关键字或类型
            const isKnown = ['MyApplication', 'Util', 'System', 'String', 'int', 'boolean'].includes(word);
            if (!isKnown) {
                const line = model.getLineContent(model.getPositionAt(match.index).lineNumber);
                // 确保不在注释或字符串中
                if (!line.trim().startsWith('//') && !line.includes(`"${word}"`) && !line.includes(`'${word}'`)) {
                    markers.push({
                        severity: window.monaco.MarkerSeverity.Error,
                        message: `Simulated error: Cannot resolve symbol '${word}'`,
                        startLineNumber: model.getPositionAt(match.index).lineNumber,
                        endLineNumber: model.getPositionAt(match.index + word.length).lineNumber,
                        startColumn: model.getPositionAt(match.index).column,
                        endColumn: model.getPositionAt(match.index + word.length).column
                    });
                }
            }
        }

        // 模拟：缺少分号 (简单判断 System.out.println 后面没有分号)
        const noSemicolonRegex = /System\.out\.println\([^)]*\)(?!;)/g;
        while ((match = noSemicolonRegex.exec(content)) !== null) {
            markers.push({
                severity: window.monaco.MarkerSeverity.Error,
                message: "Simulated error: Missing semicolon",
                startLineNumber: model.getPositionAt(match.index).lineNumber,
                endLineNumber: model.getPositionAt(match.index + match[0].length).lineNumber,
                startColumn: model.getPositionAt(match.index).column,
                endColumn: model.getPositionAt(match.index + match[0].length).column
            });
        }

        // 模拟：TODO/FIXME 警告
        const todoRegex = /\bTODO\b/g;
        while ((match = todoRegex.exec(content)) !== null) {
            markers.push({
                severity: window.monaco.MarkerSeverity.Info, // Monaco 也有 Info
                message: "TODO: This needs to be implemented.",
                startLineNumber: model.getPositionAt(match.index).lineNumber,
                endLineNumber: model.getPositionAt(match.index + match[0].length).lineNumber,
                startColumn: model.getPositionAt(match.index).column,
                endColumn: model.getPositionAt(match.index + match[0].length).column
            });
        }
        const fixmeRegex = /\bFIXME\b/g;
        while ((match = fixmeRegex.exec(content)) !== null) {
            markers.push({
                severity: window.monaco.MarkerSeverity.Warning,
                message: "FIXME: Potential issue here.",
                startLineNumber: model.getPositionAt(match.index).lineNumber,
                endLineNumber: model.getPositionAt(match.index + match[0].length).lineNumber,
                startColumn: model.getPositionAt(match.index).column,
                endColumn: model.getPositionAt(match.index + match[0].length).column
            });
        }


        window.monaco.editor.setModelMarkers(model, 'web-idea-diagnostics', markers);
        this.eventBus.emit('diagnosticsUpdated', { filePath, markers }); // 通知问题列表更新
    }


    // 打开文件
    openFile(filePath, content) {
        // 如果文件已打开，切换到该文件
        if (this.openFiles.has(filePath)) {
            this.setActiveFile(filePath);
            return;
        }

        // 创建新的Monaco模型
        const model = window.monaco.editor.createModel(content, this.getLanguageFromPath(filePath), window.monaco.Uri.file(filePath));

        // 创建文件标签页
        const tab = this.createFileTab(filePath);
        this.openFiles.set(filePath, { model, tab, isDirty: false }); // 初始状态为未修改

        this.setActiveFile(filePath);
        this.simulateDiagnostics(model); // 打开文件时立即进行诊断
    }

    // 激活文件
    setActiveFile(filePath) {
        // 移除所有tab的active类
        this.tabBar.querySelectorAll('.editor-tab').forEach(tab => tab.classList.remove('active'));

        // 激活当前文件的tab
        const fileInfo = this.openFiles.get(filePath);
        if (fileInfo) {
            fileInfo.tab.classList.add('active');
            this.monacoInstance.setModel(fileInfo.model);
            this.activeFilePath = filePath;
            // 切换文件时，更新诊断
            this.simulateDiagnostics(fileInfo.model);
        }
    }

    // 创建文件标签页
    createFileTab(filePath) {
        const tab = document.createElement('button');
        tab.className = 'editor-tab';
        tab.dataset.filePath = filePath;
        const fileName = filePath.split('/').pop();
        tab.innerHTML = `<span>${fileName}</span><span class="unsaved-indicator" title="未保存">●</span><i class="fas fa-times close-tab-btn" title="关闭"></i>`;

        // 切换文件事件
        tab.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡到父元素
            if (e.target.closest('.close-tab-btn')) { // 检查点击的是否是关闭按钮
                this.closeFile(filePath);
            } else {
                this.setActiveFile(filePath);
            }
        });
        this.tabBar.appendChild(tab);
        return tab;
    }

    // 关闭文件
    closeFile(filePath) {
        const fileInfo = this.openFiles.get(filePath);
        if (fileInfo) {
            // 销毁Monaco模型，释放内存
            fileInfo.model.dispose();
            // 移除标签页DOM
            fileInfo.tab.remove();
            // 从Map中删除
            this.openFiles.delete(filePath);

            // 清除该文件的所有诊断标记
            window.monaco.editor.setModelMarkers(fileInfo.model, 'web-idea-diagnostics', []);

            // 如果关闭的是当前活动文件，则激活下一个文件或显示欢迎界面
            if (this.activeFilePath === filePath) {
                if (this.openFiles.size > 0) {
                    const firstFilePath = this.openFiles.keys().next().value;
                    this.setActiveFile(firstFilePath);
                } else {
                    this.monacoInstance.setModel(window.monaco.editor.createModel('// Welcome to Web IDEA!', 'plaintext'));
                    this.activeFilePath = null;
                    this.eventBus.emit('editorCursorChange', { lineNumber: 1, column: 1 }); // 重置光标位置
                    this.eventBus.emit('diagnosticsUpdated', { filePath: null, markers: [] }); // 清空问题列表
                }
            }
        }
    }

    // 标记文件为已修改/未修改
    markFileModified(filePath, isDirty) {
        const fileInfo = this.openFiles.get(filePath);
        if (fileInfo) {
            fileInfo.isDirty = isDirty;
            if (isDirty) {
                fileInfo.tab.classList.add('modified');
            } else {
                fileInfo.tab.classList.remove('modified');
            }
        }
    }

    // 根据文件路径获取Monaco语言类型
    getLanguageFromPath(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        switch (ext) {
            case 'java': return 'java';
            case 'js': return 'javascript';
            case 'ts': return 'typescript';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'xml': case 'pom': return 'xml';
            case 'json': return 'json';
            case 'md': return 'markdown';
            case 'yml': case 'yaml': return 'yaml';
            case 'properties': return 'ini'; // properties 文件可以使用 ini 模式
            case 'gitignore': return 'plaintext'; // .gitignore 也是纯文本
            default: return 'plaintext';
        }
    }

    // 跳转到指定行
    gotoLine(lineNumber) {
        if (this.monacoInstance) {
            this.monacoInstance.focus(); // 聚焦编辑器
            this.monacoInstance.setPosition({ lineNumber: lineNumber, column: 1 }); // 设置光标位置
            this.monacoInstance.revealLineInCenter(lineNumber); // 滚动到行中心
        }
    }

    // 调试时高亮当前执行行
    highlightDebugLine(filePath, lineNumber) {
        if (this.activeFilePath !== filePath) {
            this.openFile(filePath, this.monacoInstance.getModel().getValue()); // 确保文件已打开并激活
        }

        const model = this.monacoInstance.getModel();

        // 设置调试装饰器
        this.debugDecorations = this.monacoInstance.deltaDecorations(this.debugDecorations, [
            {
                range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                    isAfterContentText: true,
                    linesDecorationsClassName: 'debug-line-decorator',
                    className: 'debug-line-highlight',
                },
            }
        ]);

        this.monacoInstance.revealLineInCenter(lineNumber); // 确保高亮行可见
    }

    // 清除调试高亮
    clearDebugHighlight() {
        if (this.monacoInstance) {
            this.debugDecorations = this.monacoInstance.deltaDecorations(this.debugDecorations, []);
        }
    }

    // 模拟断点设置/清除 (通过点击行号区)
    setupBreakpointListener() {
        // 这是更底层的Monaco事件监听，用于捕获gutter点击
        this.monacoInstance.onMouseDown(e => {
            if (e.target.type === window.monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
                const lineNumber = e.target.position.lineNumber;
                this.toggleBreakpoint(this.activeFilePath, lineNumber);
            }
        });
    }

    toggleBreakpoint(filePath, lineNumber) {
        // 实际应用中会维护一个断点列表，并通知后端
        console.log(`[Debugger] Toggling breakpoint at ${filePath}:${lineNumber}`);
        const model = this.monacoInstance.getModel();

        // 模拟断点装饰器
        const decorations = this.monacoInstance.getLineDecorations(lineNumber);
        const hasBreakpoint = decorations.some(d => d.options.linesDecorationsClassName === 'breakpoint-decorator');

        let newDecorations = [];
        if (hasBreakpoint) {
            // 移除断点
            this.monacoInstance.deltaDecorations(
                decorations.filter(d => d.options.linesDecorationsClassName === 'breakpoint-decorator').map(d => d.id),
                []
            );
        } else {
            // 添加断点
            newDecorations = this.monacoInstance.deltaDecorations([], [
                {
                    range: new window.monaco.Range(lineNumber, 1, lineNumber, 1),
                    options: {
                        isAfterContentText: true,
                        linesDecorationsClassName: 'breakpoint-decorator', // CSS类
                    }
                }
            ]);
        }
        // 可以在这里通知eventBus：eventBus.emit('breakpointToggled', { filePath, lineNumber, added: !hasBreakpoint });
    }
}