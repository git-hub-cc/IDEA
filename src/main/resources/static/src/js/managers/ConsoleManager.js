// src/js/managers/ConsoleManager.js - 控制台输出管理器

import EventBus from '../utils/event-emitter.js';

const ConsoleManager = {
    preElement: null,

    /**
     * @description 初始化控制台管理器。
     */
    init: function() {
        this.preElement = document.querySelector('#console-output pre');
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
    }
};

export default ConsoleManager;