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
// ========================= 关键修改 START =========================
import TourManager from './managers/TourManager.js';
// ========================= 关键修改 END ===========================

// 应用核心初始化逻辑
const App = {
    init: async function() {
        console.log("应用初始化开始...");
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
        // ========================= 关键修改 START =========================
        TourManager.init(); // 初始化 TourManager
        // ========================= 关键修改 END ===========================
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
        // ========================= 关键修改 START =========================
        // 延迟启动，确保所有UI元素都已渲染完毕
        setTimeout(() => TourManager.start(), 500);
        // ========================= 关键修改 END ===========================
    }
};

// ========================= 关键修改 START: 移除 DOMContentLoaded 包装器 =========================

// 定义一个启动函数，它处理 Monaco Editor 的异步加载
const startApp = () => {
    // 检查 Monaco Editor 是否已经由 loader.js 加载完毕
    if (window.monaco) {
        App.init();
    } else {
        // 如果没有，就监听我们自己分派的 'monaco-ready' 事件
        document.addEventListener('monaco-ready', () => App.init(), { once: true });
    }
};

// 直接调用 SessionLockManager.init，因为脚本在 body 末尾，DOM 此时已可用。
// SessionLockManager 将在检查通过后，调用 startApp 回调函数。
SessionLockManager.init(startApp);

// ========================= 关键修改 END =======================================================