// src/js/managers/ConsoleManager.js - 控制台输出管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const ConsoleManager = {
    container: null,
    viewportElement: null,
    contentElement: null,

    logLines: [],
    maxLines: 2000,
    lineHeight: 18, // 默认值, 会在初始化时动态测量
    renderRequest: null,

    /**
     * @description 初始化控制台管理器。
     */
    init: function() {
        this.container = document.getElementById('console-output');

        // 动态创建虚拟滚动所需的 DOM 结构
        this.container.innerHTML = `
            <div class="console-viewport">
                <div class="console-content"></div>
            </div>`;
        this.viewportElement = this.container.querySelector('.console-viewport');
        this.contentElement = this.container.querySelector('.console-content');

        this.bindAppEvents();
        this.measureLineHeight();

        // 绑定滚动事件，用于按需渲染
        this.viewportElement.addEventListener('scroll', () => this.requestRender(), { passive: true });
        // 监听UI布局变化，确保在面板大小调整后重新渲染
        EventBus.on('ui:layoutChanged', () => this.requestRender());
        window.addEventListener('resize', () => this.requestRender());


        // 应用初始设置
        EventBus.on('app:ready', async () => {
            try {
                const settings = await NetworkManager.getSettings();
                this.applySettings(settings);
            } catch (e) {
                console.warn("无法为控制台加载初始设置，使用默认值。", e);
            }
        });

        this.clear();
        this.log('欢迎使用Web IDEA控制台。');
    },

    /**
     * @description 动态测量单行日志的高度。
     */
    measureLineHeight() {
        const tempLine = document.createElement('div');
        tempLine.className = 'console-line';
        tempLine.style.visibility = 'hidden';
        tempLine.textContent = 'M'; // 用一个字符来测量
        this.contentElement.appendChild(tempLine);
        this.lineHeight = tempLine.offsetHeight;
        this.contentElement.removeChild(tempLine);

        if (this.lineHeight === 0) { // 回退方案
            this.lineHeight = 18;
            console.warn("无法动态测量行高，回退到默认值 18px。");
        }
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
        EventBus.on('log:warn', (msg) => this.log(`[警告] ${msg}`, 'warn'));
        EventBus.on('log:error', (msg) => this.error(msg));
        // 监听全局设置变更事件
        EventBus.on('settings:changed', this.applySettings.bind(this));
    },

    /**
     * @description 在控制台输出一条标准日志。
     * @param {string} message - 要输出的消息。
     * @param {string} type - 日志类型: 'log', 'warn', 'error'
     */
    log: function(message, type = 'log') {
        const timestamp = new Date().toLocaleTimeString();
        const lines = String(message).split('\n');
        const wasAtBottom = this.isAtBottom();

        lines.forEach(line => {
            this.logLines.push({
                text: line,
                timestamp,
                type
            });
        });

        // 超过2000行时，从开头移除旧日志
        if (this.logLines.length > this.maxLines) {
            this.logLines.splice(0, this.logLines.length - this.maxLines);
        }

        this.requestRender();

        // 如果之前就在底部，新日志到达后自动滚动到底部
        if (wasAtBottom) {
            requestAnimationFrame(() => {
                this.viewportElement.scrollTop = this.viewportElement.scrollHeight;
            });
        }
    },

    /**
     * @description 在控制台输出一条错误日志。
     * @param {string} message - 错误消息。
     */
    error: function(message) {
        this.log(`[错误] ${message}`, 'error');
    },

    /**
     * @description 清空控制台。
     */
    clear: function() {
        this.logLines = [];
        this.requestRender();
    },

    /**
     * @description 请求在下一动画帧执行渲染，避免频繁操作DOM。
     */
    requestRender: function() {
        if (!this.renderRequest) {
            this.renderRequest = requestAnimationFrame(() => {
                this.render();
                this.renderRequest = null;
            });
        }
    },

    /**
     * @description 核心渲染函数，实现虚拟滚动。
     */
    render: function() {
        if (!this.viewportElement) return;

        const { scrollTop, clientHeight } = this.viewportElement;

        // 计算可见区域的起始和结束行索引，并加入上下缓冲区以优化平滑滚动体验
        const firstVisibleLine = Math.floor(scrollTop / this.lineHeight);
        const numVisibleLines = Math.ceil(clientHeight / this.lineHeight);
        const buffer = 10;
        const startIndex = Math.max(0, firstVisibleLine - buffer);
        const endIndex = Math.min(this.logLines.length, firstVisibleLine + numVisibleLines + buffer);

        // 更新内容容器的总高度，以确保滚动条正确反映所有日志行的总高度
        this.contentElement.style.height = `${this.logLines.length * this.lineHeight}px`;

        // 生成仅对可见行有效的HTML
        let visibleLinesHtml = '';
        for (let i = startIndex; i < endIndex; i++) {
            const lineData = this.logLines[i];
            const escapedText = this.escapeHtml(lineData.text);
            visibleLinesHtml += `<div class="console-line ${lineData.type}" style="top: ${i * this.lineHeight}px;">[${lineData.timestamp}] ${escapedText}</div>`;
        }

        this.contentElement.innerHTML = visibleLinesHtml;
    },

    /**
     * @description 检查滚动条是否在底部。
     * @returns {boolean}
     */
    isAtBottom: function() {
        if (!this.viewportElement) return true;
        const { scrollTop, scrollHeight, clientHeight } = this.viewportElement;
        // 允许一些像素误差
        return scrollHeight - scrollTop - clientHeight < this.lineHeight;
    },

    /**
     * @description 应用设置，特别是自动换行。
     * @param {object} settings - 新的设置对象。
     */
    applySettings: function(settings) {
        if (!this.container) return;
        this.container.classList.toggle('no-wrap', !settings.wordWrap);
        this.requestRender();
    },

    /**
     * @description 对HTML进行转义，防止XSS。
     * @param {string} str - 原始字符串。
     * @returns {string} - 转义后的字符串。
     */
    escapeHtml: function(str) {
        return str.replace(/[&<>"']/g, match => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    }
};

export default ConsoleManager;