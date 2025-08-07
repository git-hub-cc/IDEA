// src/js/services/CompletionProviderService.js - Monaco自动补全提供者服务

import ProjectAnalysisService from './ProjectAnalysisService.js';

/**
 * @description 此服务负责向 Monaco Editor 注册自动补全提供者。
 * 它结合了静态的代码片段（来自commands.json）和动态的分析数据
 * （如来自ProjectAnalysisService的Java类名）来提供丰富的代码补全建议。
 */
const CompletionProviderService = {
    allCommands: [],
    isInitialized: false,

    /**
     * @description 初始化服务，加载指令并注册提供者。
     * @returns {Promise<void>}
     */
    init: async function() {
        if (this.isInitialized) return;
        try {
            await this.loadCommands();
            this.registerCompletionProvider();
            this.isInitialized = true;
            console.log('自定义代码补全服务已注册。');
        } catch (error) {
            console.error('初始化自定义代码补全服务失败:', error);
        }
    },

    /**
     * @description 从 JSON 文件加载所有指令/片段。
     */
    loadCommands: async function() {
        const response = await fetch('src/js/data/commands.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.allCommands = await response.json();
    },

    /**
     * @description 向 Monaco Editor 注册一个全局的补全项提供者。
     */
    registerCompletionProvider: function() {
        if (typeof window.monaco === 'undefined') {
            console.error('Monaco Editor 未加载，无法注册补全提供者。');
            return;
        }

        monaco.languages.registerCompletionItemProvider(['java', 'html', 'css', 'javascript', 'vue'], {
            provideCompletionItems: (model, position) => {
                const language = model.getLanguageId();
                const word = model.getWordUntilPosition(position);
                const range = new monaco.Range(
                    position.lineNumber, word.startColumn,
                    position.lineNumber, word.endColumn
                );

                let allSuggestions = [];

                // 为Java语言添加动态类名建议
                if (language === 'java') {
                    const classNames = ProjectAnalysisService.getClassNames();
                    const classSuggestions = classNames.map(function(fqn) {
                        const simpleName = fqn.substring(fqn.lastIndexOf('.') + 1);
                        const packageName = fqn.substring(0, fqn.lastIndexOf('.'));
                        return {
                            label: simpleName,
                            kind: monaco.languages.CompletionItemKind.Class,
                            documentation: `来自包: ${packageName}`,
                            detail: packageName,
                            insertText: simpleName,
                            range: range
                        };
                    });
                    allSuggestions = allSuggestions.concat(classSuggestions);
                }

                // 添加静态代码片段建议
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

                allSuggestions = allSuggestions.concat(snippetSuggestions);

                return {
                    suggestions: allSuggestions
                };
            }
        });
    }
};

export default CompletionProviderService;