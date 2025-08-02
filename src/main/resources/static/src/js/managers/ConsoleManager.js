// src/js/managers/ConsoleManager.js - 控制台输出管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const ConsoleManager = {
    container: null,
    preElement: null,

    /**
     * @description 初始化控制台管理器。
     */
    init: function() {
        // ========================= 关键修改 START =========================
        this.container = document.getElementById('console-output');
        this.preElement = this.container.querySelector('pre');

        // 应用启动时，获取初始设置并应用
        EventBus.on('app:ready', async () => {
            try {
                const settings = await NetworkManager.getSettings();
                this.applySettings(settings);
            } catch (e) {
                console.warn("无法为控制台加载初始设置，使用默认值。", e);
                // 默认是开启换行，所以不需要额外操作
            }
        });
        // ========================= 关键修改 END ===========================

        this.bindAppEvents();
        this.clear();
        this.log('欢迎使用Web IDEA控制台。');
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        EventBus.on('console:log', this.log.bind(this));
        EventBus.on('console:error', this.error.bind(this));
        EventBus.on('console:clear', this.clear.bind(this));
        // 统一监听所有日志事件
        EventBus.on('log:info', (msg) => this.log(`[信息] ${msg}`));
        EventBus.on('log:warn', (msg) => this.log(`[警告] ${msg}`));
        EventBus.on('log:error', (msg) => this.error(msg));

        // ========================= 关键修改 START =========================
        // 监听全局设置变更事件
        EventBus.on('settings:changed', this.applySettings.bind(this));
        // ========================= 关键修改 END ===========================
    },

    /**
     * @description 在控制台输出一条标准日志。
     * @param {string} message - 要输出的消息。
     */
    log: function(message) {
        if (!this.preElement) return;
        const timestamp = new Date().toLocaleTimeString();
        this.preElement.textContent += `[${timestamp}] ${message}\n`;
        // 自动滚动到底部
        this.preElement.parentElement.scrollTop = this.preElement.parentElement.scrollHeight;
    },

    /**
     * @description 在控制台输出一条错误日志。
     * @param {string} message - 错误消息。
     */
    error: function(message) {
        this.log(`[错误] ${message}`);
    },

    /**
     * @description 清空控制台。
     */
    clear: function() {
        if(this.preElement) this.preElement.textContent = '';
    },

    // ========================= 关键修改 START =========================
    /**
     * @description 应用设置，特别是自动换行。
     * @param {object} settings - 新的设置对象。
     */
    applySettings: function(settings) {
        if (!this.container) return;
        // 如果 wordWrap 为 true, 移除 'no-wrap' 类 (开启换行)
        // 如果 wordWrap 为 false, 添加 'no-wrap' 类 (关闭换行)
        this.container.classList.toggle('no-wrap', !settings.wordWrap);
    }
    // ========================= 关键修改 END ===========================
};

export default ConsoleManager;