// theme-manager.js - 主题管理器
export class ThemeManager {
    constructor(eventBus, defaultTheme = 'dark-theme') {
        this.eventBus = eventBus;
        this.themeLink = document.getElementById('theme-link');
        this.currentTheme = defaultTheme;
    }

    init() {
        // 设置初始主题
        this.setTheme(this.currentTheme);
    }

    setTheme(themeName) {
        // 更新<body>上的类
        document.body.classList.remove('dark-theme', 'light-theme'); // 移除所有已知主题类
        document.body.classList.add(themeName); // 添加新主题类

        // 更新CSS链接
        this.themeLink.href = `src/css/${themeName}.css`;
        this.currentTheme = themeName;

        // 通知Monaco Editor更新主题
        if (window.monaco && window.monaco.editor) {
            // Monaco Editor 内置的主题名和我们的CSS主题名可能不同
            // 需要映射：dark-theme -> vs-dark, light-theme -> vs-light
            const monacoTheme = themeName === 'dark-theme' ? 'vs-dark' : 'vs-light';
            window.monaco.editor.setTheme(monacoTheme);
        }

        this.eventBus.emit('themeChanged', themeName);
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}