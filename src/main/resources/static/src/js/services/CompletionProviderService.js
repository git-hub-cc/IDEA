// src/js/services/CompletionProviderService.js

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
        // 确保 monaco 对象可用
        if (typeof window.monaco === 'undefined') {
            console.error('Monaco Editor 未加载，无法注册补全提供者。');
            return;
        }

        monaco.languages.registerCompletionItemProvider(['java', 'html', 'css', 'javascript', 'vue'], {
            // provideCompletionItems 是 Monaco Editor 在需要建议时会调用的核心方法
            provideCompletionItems: (model, position) => {
                const language = model.getLanguageId();

                // ========================= 关键修改 START =========================
                // 1. 获取用户在光标前输入的单词信息。
                //    这会返回一个对象，例如 { word: "sout", startColumn: 1, endColumn: 5 }
                const word = model.getWordUntilPosition(position);

                // 2. 根据获取的单词信息，创建一个将要被替换的文本范围。
                const range = new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn
                );
                // ========================= 关键修改 END ===========================


                // 3. 从所有指令中筛选出类型为 'snippet' 且匹配当前语言的项
                const languageSnippets = this.allCommands.filter(cmd =>
                    cmd.type === 'snippet' && cmd.language === language
                );

                // 4. 将我们的片段格式转换为 Monaco 需要的格式
                const suggestions = languageSnippets.map(snippet => {
                    return {
                        label: snippet.label, // 显示在建议列表中的文本 (e.g., "sout")
                        kind: monaco.languages.CompletionItemKind.Snippet, // 告诉 Monaco 这是一个代码片段
                        documentation: snippet.description, // 鼠标悬浮时显示的详细描述
                        insertText: snippet.body, // 实际插入的文本内容
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, // 使 ${0}, ${1:var} 等占位符生效
                        // ========================= 关键修改 START =========================
                        // 5. 将我们计算出的替换范围应用到每个建议项。
                        range: range
                        // ========================= 关键修改 END ===========================
                    };
                });

                // 6. 返回包含所有建议的列表
                return {
                    suggestions: suggestions
                };
            }
        });
    }
};

export default CompletionProviderService;