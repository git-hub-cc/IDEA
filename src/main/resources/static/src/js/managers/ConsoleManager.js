// src/js/managers/ConsoleManager.js - 控制台输出管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import TemplateLoader from '../utils/TemplateLoader.js';

/**
 * @description 管理“日志”面板的输出。采用虚拟滚动技术来高效处理大量日志数据，
 * 避免因DOM元素过多导致的性能问题。
 */
const ConsoleManager = {
    container: null,
    viewportElement: null,
    contentElement: null,

    logLines: [],
    maxLines: 2000,
    lineHeight: 18, // 初始默认值，会被动态测量覆盖
    renderRequest: null,

    /**
     * @description 初始化控制台管理器。
     */
    init: function() {
        this.container = document.getElementById('console-output');

        const viewportFragment = TemplateLoader.get('console-viewport-template');
        if (viewportFragment) {
            this.container.appendChild(viewportFragment);
        }

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
                this.applySettings({ wordWrap: true });
            }
        });

        this.clear();
        this.log('欢迎使用Web IDEA控制台。');
    },

    /**
     * @description 动态测量一行的实际高度，用于虚拟滚动计算。
     */
    measureLineHeight: function() {
        const tempLine = document.createElement('div');
        tempLine.className = 'console-line';
        tempLine.style.position = 'absolute';
        tempLine.style.visibility = 'hidden';
        tempLine.textContent = 'M'; // A single character for measurement
        this.contentElement.appendChild(tempLine);
        this.lineHeight = tempLine.offsetHeight;
        this.contentElement.removeChild(tempLine);

        if (this.lineHeight === 0) {
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
        EventBus.on('log:info', (msg) => this.log(`[信息] ${msg}`));
        EventBus.on('log:warn', (msg) => this.log(`[警告] ${msg}`, 'warn'));
        EventBus.on('log:error', (msg) => this.error(msg));
        EventBus.on('settings:changed', this.applySettings.bind(this));
    },

    /**
     * @description 添加一条日志。
     * @param {string} message - 日志消息。
     * @param {string} [type='log'] - 日志类型 ('log', 'warn', 'error')。
     */
    log: function(message, type = 'log') {
        const timestamp = new Date().toLocaleTimeString();
        const lines = String(message).split('\n');
        const wasAtBottom = this.isAtBottom();

        lines.forEach(function(line) {
            this.logLines.push({
                text: line,
                timestamp: timestamp,
                type: type,
                height: null, // 高度将在渲染时动态计算
                top: null
            });
        }, this);

        // 保持日志行数在最大限制内
        if (this.logLines.length > this.maxLines) {
            this.logLines.splice(0, this.logLines.length - this.maxLines);
        }

        this.requestRender();

        // 如果用户正在查看底部，则自动滚动到底部
        if (wasAtBottom) {
            requestAnimationFrame(() => {
                if (this.viewportElement) this.viewportElement.scrollTop = this.viewportElement.scrollHeight;
            });
        }
    },

    /**
     * @description 添加一条错误类型的日志。
     * @param {string} message - 错误消息。
     */
    error: function(message) {
        this.log(`[错误] ${message}`, 'error');
    },

    /**
     * @description 清空所有日志。
     */
    clear: function() {
        this.logLines = [];
        this.requestRender();
    },

    /**
     * @description 请求一个动画帧来执行渲染，避免频繁重绘。
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
     * 仅渲染当前视口内可见的日志行。
     */
    render: function() {
        if (!this.viewportElement) return;

        // 计算所有行的总高度和每行的起始位置
        let currentTop = 0;
        this.logLines.forEach(function(line) {
            line.top = currentTop;
            currentTop += line.height || this.lineHeight;
        }, this);
        const totalHeight = currentTop;
        this.contentElement.style.height = `${totalHeight}px`;

        const { scrollTop, clientHeight } = this.viewportElement;

        // 确定需要渲染的行的起始和结束索引
        let startIndex = this.logLines.findIndex(line => (line.top + (line.height || this.lineHeight)) >= scrollTop);
        if (startIndex === -1) startIndex = 0;

        let endIndex = this.logLines.findIndex(line => line.top >= scrollTop + clientHeight);
        if (endIndex === -1) endIndex = this.logLines.length;

        // 添加缓冲区，以改善滚动体验
        const buffer = 10;
        startIndex = Math.max(0, startIndex - buffer);
        endIndex = Math.min(this.logLines.length, endIndex + buffer);

        // 生成可见行的HTML
        let visibleLinesHtml = '';
        for (let i = startIndex; i < endIndex; i++) {
            const lineData = this.logLines[i];
            const escapedText = this.escapeHtml(lineData.text);
            visibleLinesHtml += `<div class="console-line ${lineData.type}" style="top: ${lineData.top}px;" data-index="${i}">[${lineData.timestamp}] ${escapedText}</div>`;
        }
        this.contentElement.innerHTML = visibleLinesHtml;

        // 动态测量并缓存自动换行后的行高
        const renderedElements = this.contentElement.querySelectorAll('.console-line');
        let heightHasChanged = false;
        renderedElements.forEach(function(element) {
            const index = parseInt(element.dataset.index, 10);
            const lineData = this.logLines[index];
            if (lineData && lineData.height === null) {
                lineData.height = element.offsetHeight;
                heightHasChanged = true;
            }
        }, this);

        // 如果有任何行高发生变化，重新请求渲染以更新布局
        if (heightHasChanged) {
            this.requestRender();
        }
    },

    /**
     * @description 检查滚动条是否在底部。
     * @returns {boolean}
     */
    isAtBottom: function() {
        if (!this.viewportElement) return true;
        const { scrollTop, scrollHeight, clientHeight } = this.viewportElement;
        // 允许一些误差范围
        return scrollHeight - scrollTop - clientHeight < (this.lineHeight * 2);
    },

    /**
     * @description 根据设置应用自动换行样式。
     * @param {object} settings - 设置对象。
     */
    applySettings: function(settings) {
        if (!this.container || !settings) return;
        const shouldWrap = settings.wordWrap;
        const hasNoWrapClass = this.container.classList.contains('no-wrap');
        const shouldHaveNoWrapClass = !shouldWrap;

        if (hasNoWrapClass !== shouldHaveNoWrapClass) {
            this.container.classList.toggle('no-wrap', shouldHaveNoWrapClass);
            // 重置所有行高缓存，以便在下次渲染时重新测量
            this.logLines.forEach(line => { line.height = null; });
            this.requestRender();
        }
    },

    /**
     * @description 对HTML特殊字符进行转义，防止XSS。
     * @param {string} str - 原始字符串。
     * @returns {string} 转义后的字符串。
     */
    escapeHtml: function(str) {
        return str.replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[match];
        });
    }
};

export default ConsoleManager;