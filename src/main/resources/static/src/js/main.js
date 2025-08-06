// src/js/main.js - 应用主入口和初始化引导程序
import EventBus from './utils/event-emitter.js';
import SessionLockManager from './managers/SessionLockManager.js';
import NetworkManager from './managers/NetworkManager.js';
import UIManager from './managers/UIManager.js';
import ThemeManager from './utils/theme-manager.js';
import ModalManager from './managers/ModalManager.js';
import ToolbarManager from './managers/ToolbarManager.js';
import StatusBarManager from './managers/StatusBarManager.js';
import FileTreeManager from './managers/FileTreeManager.js';
import CodeEditorManager from './managers/CodeEditorManager.js';
import ConsoleManager from './managers/ConsoleManager.js';
import ProblemsManager from './managers/ProblemsManager.js';
import TerminalManager from './managers/TerminalManager.js';
import DebuggerManager from './managers/DebuggerManager.js';
import ActionManager from './managers/ActionManager.js';
import KeyboardManager from './managers/KeyboardManager.js';
import ContextMenuManager from './managers/ContextMenuManager.js';
import CommandPaletteManager from './managers/CommandPaletteManager.js';
import ProjectAnalysisService from './services/ProjectAnalysisService.js';
import RunManager from './managers/RunManager.js';
import TourManager from './managers/TourManager.js';
import TemplateLoader from './utils/TemplateLoader.js'; // 引入模板加载器

// 应用核心初始化逻辑
const App = {
    init: async function() {
        console.log("应用初始化开始...");

        // ========================= 关键修改 START: 首先加载模板 =========================
        await TemplateLoader.init();
        // ========================= 关键修改 END ======================================

        NetworkManager.init();
        ThemeManager.init();
        ModalManager.init();
        ContextMenuManager.init();
        UIManager.init();
        ToolbarManager.init();
        StatusBarManager.init();
        FileTreeManager.init();
        ProjectAnalysisService.init();
        RunManager.init();
        TourManager.init();
        await CodeEditorManager.init();
        ConsoleManager.init();
        ProblemsManager.init();
        TerminalManager.init();
        DebuggerManager.init();
        await CommandPaletteManager.init();
        ActionManager.init();
        await KeyboardManager.init();
        EventBus.emit('app:ready');
        console.log("应用已准备就绪。");
        // 延迟启动 Tour，确保所有UI元素都已渲染完毕
        setTimeout(() => TourManager.start(), 500);
    }
};

const startApp = () => {
    if (window.monaco) {
        App.init();
    } else {
        document.addEventListener('monaco-ready', () => App.init(), { once: true });
    }
};

SessionLockManager.init(startApp);