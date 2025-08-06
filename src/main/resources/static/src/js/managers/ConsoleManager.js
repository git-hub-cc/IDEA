// src/js/managers/ConsoleManager.js - 控制台输出管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const ConsoleManager = {
    container: null,
    viewportElement: null,
    contentElement: null,

    logLines: [],
    maxLines: 2000,
    lineHeight: 18, // 作为未测量行的预估高度
    renderRequest: null,

    /**
     * @description 初始化控制台管理器。
     */
    init: function() {
        this.container = document.getElementById('console-output');

        this.container.innerHTML = `
            <div class="console-viewport">
                <div class="console-content"></div>
            </div>`;
        this.viewportElement = this.container.querySelector('.console-viewport');
        this.contentElement = this.container.querySelector('.console-content');

        this.bindAppEvents();
        this.measureLineHeight();

        this.viewportElement.addEventListener('scroll', () => this.requestRender(), { passive: true });
        EventBus.on('ui:layoutChanged', () => this.requestRender());
        window.addEventListener('resize', () => this.requestRender());

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

    measureLineHeight() {
        const tempLine = document.createElement('div');
        tempLine.className = 'console-line';
        tempLine.style.position = 'absolute'; // 确保不影响布局
        tempLine.style.visibility = 'hidden';
        tempLine.textContent = 'M';
        this.contentElement.appendChild(tempLine);
        this.lineHeight = tempLine.offsetHeight;
        this.contentElement.removeChild(tempLine);

        if (this.lineHeight === 0) {
            this.lineHeight = 18;
            console.warn("无法动态测量行高，回退到默认值 18px。");
        }
    },

    bindAppEvents: function() {
        EventBus.on('console:log', this.log.bind(this));
        EventBus.on('console:error', this.error.bind(this));
        EventBus.on('console:clear', this.clear.bind(this));
        EventBus.on('log:info', (msg) => this.log(`[信息] ${msg}`));
        EventBus.on('log:warn', (msg) => this.log(`[警告] ${msg}`, 'warn'));
        EventBus.on('log:error', (msg) => this.error(msg));
        EventBus.on('settings:changed', this.applySettings.bind(this));
    },

    log: function(message, type = 'log') {
        const timestamp = new Date().toLocaleTimeString();
        const lines = String(message).split('\n');
        const wasAtBottom = this.isAtBottom();

        lines.forEach(line => {
            // ========================= 关键修改 START: 增加 height 和 top 属性 =========================
            this.logLines.push({
                text: line,
                timestamp,
                type,
                height: null, // 初始高度未知
                top: null     // 初始位置未知
            });
            // ========================= 关键修改 END ==========================================
        });

        if (this.logLines.length > this.maxLines) {
            this.logLines.splice(0, this.logLines.length - this.maxLines);
        }

        this.requestRender();

        if (wasAtBottom) {
            requestAnimationFrame(() => {
                this.viewportElement.scrollTop = this.viewportElement.scrollHeight;
            });
        }
    },

    error: function(message) {
        this.log(`[错误] ${message}`, 'error');
    },

    clear: function() {
        this.logLines = [];
        this.requestRender();
    },

    requestRender: function() {
        if (!this.renderRequest) {
            this.renderRequest = requestAnimationFrame(() => {
                this.render();
                this.renderRequest = null;
            });
        }
    },

    // ========================= 关键修改 START: 重写整个 render 方法以支持动态行高 =========================
    /**
     * @description 核心渲染函数，实现支持动态行高的虚拟滚动。
     */
    render: function() {
        if (!this.viewportElement) return;

        // 1. 重新计算每行的 top 位置和总高度
        let currentTop = 0;
        this.logLines.forEach(line => {
            line.top = currentTop;
            currentTop += line.height || this.lineHeight; // 使用已缓存的真实高度，否则使用预估高度
        });
        const totalHeight = currentTop;
        this.contentElement.style.height = `${totalHeight}px`;

        // 2. 确定需要渲染的可见行范围
        const { scrollTop, clientHeight } = this.viewportElement;

        let startIndex = this.logLines.findIndex(line => (line.top + (line.height || this.lineHeight)) >= scrollTop);
        if (startIndex === -1) startIndex = 0;

        let endIndex = this.logLines.findIndex(line => line.top >= scrollTop + clientHeight);
        if (endIndex === -1) endIndex = this.logLines.length;

        // 添加缓冲区，优化平滑滚动体验
        const buffer = 10;
        startIndex = Math.max(0, startIndex - buffer);
        endIndex = Math.min(this.logLines.length, endIndex + buffer);

        // 3. 生成可见行的 HTML
        let visibleLinesHtml = '';
        for (let i = startIndex; i < endIndex; i++) {
            const lineData = this.logLines[i];
            const escapedText = this.escapeHtml(lineData.text);
            // 使用缓存的 `top` 值进行绝对定位
            visibleLinesHtml += `<div class="console-line ${lineData.type}" style="top: ${lineData.top}px;" data-index="${i}">[${lineData.timestamp}] ${escapedText}</div>`;
        }
        this.contentElement.innerHTML = visibleLinesHtml;

        // 4. 测量新渲染行的实际高度并缓存
        const renderedElements = this.contentElement.querySelectorAll('.console-line');
        let heightHasChanged = false;

        renderedElements.forEach(element => {
            const index = parseInt(element.dataset.index, 10);
            const lineData = this.logLines[index];
            // 只测量高度未知的行
            if (lineData && lineData.height === null) {
                const measuredHeight = element.offsetHeight;
                lineData.height = measuredHeight;
                heightHasChanged = true;
            }
        });

        // 5. 如果有任何行的高度被更新，则在下一帧重新渲染以修正布局
        if (heightHasChanged) {
            this.requestRender();
        }
    },
    // ========================= 关键修改 END =======================================================

    isAtBottom: function() {
        if (!this.viewportElement) return true;
        const { scrollTop, scrollHeight, clientHeight } = this.viewportElement;
        return scrollHeight - scrollTop - clientHeight < (this.lineHeight * 2); // 允许两行误差
    },

    applySettings: function(settings) {
        if (!this.container) return;
        // ========================= 关键修改 START =========================
        // 修正了在切换换行设置时更新UI的逻辑
        const shouldWrap = settings.wordWrap; // true代表需要换行
        const hasNoWrapClass = this.container.classList.contains('no-wrap');
        const shouldHaveNoWrapClass = !shouldWrap; // 不换行时，应有 'no-wrap' 类

        // 仅当当前状态与目标状态不符时才执行操作
        if (hasNoWrapClass !== shouldHaveNoWrapClass) {
            this.container.classList.toggle('no-wrap', shouldHaveNoWrapClass);
            // 切换换行模式会改变所有行高，因此清空缓存并请求重绘
            this.logLines.forEach(line => { line.height = null; });
            this.requestRender();
        }
        // ========================= 关键修改 END ===========================
    },

    escapeHtml: function(str) {
        return str.replace(/[&<>"']/g, match => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    }
};

export default ConsoleManager;