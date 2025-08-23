// src/js/main.js - 应用主入口和初始化引导程序
import EventBus from './utils/event-emitter.js';
import SessionLockManager from './managers/SessionLockManager.js';
import NetworkManager from './managers/NetworkManager.js';
import UIManager from './managers/UIManager.js';
import ThemeManager from './utils/ThemeManager.js';
import ModalManager from './managers/ModalManager.js';
import ToolbarManager from './managers/ToolbarManager.js';
import StatusBarManager from './managers/StatusBarManager.js';
import FileTreeManager from './managers/FileTreeManager.js';
import CodeEditorManager from './managers/CodeEditorManager.js';
import ConsoleManager from './managers/ConsoleManager.js';
import ProblemsManager from './managers/ProblemsManager.js';
import TerminalManager from './managers/TerminalManager.js';
import DebuggerManager from './managers/DebuggerManager.js';
// ========================= 新增 START =========================
import DebugConsoleManager from './managers/DebugConsoleManager.js';
// ========================= 新增 END ===========================
import ActionManager from './managers/ActionManager.js';
import KeyboardManager from './managers/KeyboardManager.js';
import ContextMenuManager from './managers/ContextMenuManager.js';
import CommandPaletteManager from './managers/CommandPaletteManager.js';
import ProjectAnalysisService from './services/ProjectAnalysisService.js';
import RunManager from './managers/RunManager.js';
import TourManager from './managers/TourManager.js';
import TemplateLoader from './utils/TemplateLoader.js';
import MonitorManager from './managers/MonitorManager.js';

/**
 * @description 应用核心初始化逻辑。
 */
const App = {
    /**
     * @description 初始化所有应用模块。
     * 此函数是应用的入口点，它按照正确的依赖顺序加载和初始化所有管理器和服务。
     */
    init: async function() {
        console.log("应用初始化开始...");

        // 步骤 1: 加载 HTML 模板，这是许多 UI 管理器的前置依赖。
        await TemplateLoader.init();

        // 步骤 2: 初始化核心管理器和服务。
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
        // ========================= 新增 START =========================
        DebugConsoleManager.init();
        // ========================= 新增 END ===========================
        MonitorManager.init();
        await CommandPaletteManager.init();
        ActionManager.init();
        await KeyboardManager.init();

        // 步骤 3: 所有模块准备就绪，广播 app:ready 事件。
        EventBus.emit('app:ready');
        console.log("应用已准备就绪。");

        // 步骤 4: 广播应用初始化完成事件，通知 SessionLockManager 隐藏初始加载遮罩
        EventBus.emit('app:initialization-complete');

        // 步骤 5: 延迟启动功能引导，确保所有UI元素都已渲染完毕并可见。
        setTimeout(function() {
            TourManager.start();
        }, 500);
    }
};

/**
 * @description 启动应用的包装函数。
 * 检查 Monaco Editor 是否已加载，如果未加载，则等待 'monaco-ready' 事件。
 */
const startApp = function() {
    if (window.monaco) {
        App.init();
    } else {
        document.addEventListener('monaco-ready', function() {
            App.init();
        }, { once: true });
    }
};

// 通过会话锁管理器启动应用，这是整个流程的起点。
SessionLockManager.init(startApp);