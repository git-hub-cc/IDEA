// src/js/services/CompletionProviderService.js

import ProjectAnalysisService from './ProjectAnalysisService.js'; // 导入新服务

/**
 * 此服务负责从 commands.json 加载代码片段，
 * 并将它们注册为 Monaco Editor 的自动补全提供者。
 */
const CompletionProviderService = {
    allCommands: [],
    isInitialized: false,

    /**
     * 初始化服务，加载指令并注册提供者。
     */
    async init() {
        if (this.isInitialized) return;

        try {
            await this.loadCommands();
            this.registerCompletionProvider();
            this.isInitialized = true;
            console.log('自定义代码片段补全服务已注册。');
        } catch (error) {
            console.error('初始化自定义代码片段补全服务失败:', error);
        }
    },

    /**
     * 从 JSON 文件加载所有指令/片段。
     */
    async loadCommands() {
        const response = await fetch('src/js/data/commands.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.allCommands = await response.json();
    },

    /**
     * 向 Monaco Editor 注册一个全局的补全项提供者。
     */
    registerCompletionProvider() {
        if (typeof window.monaco === 'undefined') {
            console.error('Monaco Editor 未加载，无法注册补全提供者。');
            return;
        }

        monaco.languages.registerCompletionItemProvider(['java', 'html', 'css', 'javascript', 'vue'], {
            provideCompletionItems: (model, position) => {
                const language = model.getLanguageId();
                const word = model.getWordUntilPosition(position);
                const range = new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn
                );

                // ========================= 关键修改 START =========================
                // 1. 获取所有建议，初始化为空数组
                let allSuggestions = [];

                // 2. 如果是Java语言，则添加类名建议
                if (language === 'java') {
                    const classNames = ProjectAnalysisService.getClassNames();
                    const classSuggestions = classNames.map(fqn => {
                        const simpleName = fqn.substring(fqn.lastIndexOf('.') + 1);
                        const packageName = fqn.substring(0, fqn.lastIndexOf('.'));
                        return {
                            label: simpleName, // 提示列表里显示的是简单类名
                            kind: monaco.languages.CompletionItemKind.Class, // 图标是"类"
                            documentation: `Class from package: ${packageName}`, // 悬浮提示
                            detail: packageName, // 在提示项右侧显示包名
                            insertText: simpleName, // 插入的文本是简单类名
                            range: range
                        };
                    });
                    allSuggestions = allSuggestions.concat(classSuggestions);
                }

                // 3. 添加静态代码片段建议
                const languageSnippets = this.allCommands.filter(cmd =>
                    cmd.type === 'snippet' && cmd.language === language
                );

                const snippetSuggestions = languageSnippets.map(snippet => ({
                    label: snippet.label,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    documentation: snippet.description,
                    insertText: snippet.body,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range: range
                }));

                // 4. 合并所有建议
                allSuggestions = allSuggestions.concat(snippetSuggestions);

                return {
                    suggestions: allSuggestions
                };
                // ========================= 关键修改 END ===========================
            }
        });
    }
};

export default CompletionProviderService;