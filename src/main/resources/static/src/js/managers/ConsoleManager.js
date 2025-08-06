// src/js/managers/ConsoleManager.js - 控制台输出管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const ConsoleManager = {
    container: null,
    viewportElement: null,
    contentElement: null,

    logLines: [],
    maxLines: 2000,
    lineHeight: 18,
    renderRequest: null,

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

        // ========================= 关键修改 START: 确保在 app:ready 后加载设置 =========================
        EventBus.on('app:ready', async () => {
            try {
                // 等待app ready确保settings可以被获取
                const settings = await NetworkManager.getSettings();
                this.applySettings(settings);
            } catch (e) {
                console.warn("无法为控制台加载初始设置，使用默认值。", e);
                // 即使加载失败，也应用一个默认值
                this.applySettings({ wordWrap: true });
            }
        });
        // ========================= 关键修改 END ===================================================

        this.clear();
        this.log('欢迎使用Web IDEA控制台。');
    },

    measureLineHeight() {
        const tempLine = document.createElement('div');
        tempLine.className = 'console-line';
        tempLine.style.position = 'absolute';
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
            this.logLines.push({
                text: line,
                timestamp,
                type,
                height: null,
                top: null
            });
        });

        if (this.logLines.length > this.maxLines) {
            this.logLines.splice(0, this.logLines.length - this.maxLines);
        }

        this.requestRender();

        if (wasAtBottom) {
            requestAnimationFrame(() => {
                if(this.viewportElement) this.viewportElement.scrollTop = this.viewportElement.scrollHeight;
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

    render: function() {
        if (!this.viewportElement) return;

        let currentTop = 0;
        this.logLines.forEach(line => {
            line.top = currentTop;
            currentTop += line.height || this.lineHeight;
        });
        const totalHeight = currentTop;
        this.contentElement.style.height = `${totalHeight}px`;

        const { scrollTop, clientHeight } = this.viewportElement;

        let startIndex = this.logLines.findIndex(line => (line.top + (line.height || this.lineHeight)) >= scrollTop);
        if (startIndex === -1) startIndex = 0;

        let endIndex = this.logLines.findIndex(line => line.top >= scrollTop + clientHeight);
        if (endIndex === -1) endIndex = this.logLines.length;

        const buffer = 10;
        startIndex = Math.max(0, startIndex - buffer);
        endIndex = Math.min(this.logLines.length, endIndex + buffer);

        let visibleLinesHtml = '';
        for (let i = startIndex; i < endIndex; i++) {
            const lineData = this.logLines[i];
            const escapedText = this.escapeHtml(lineData.text);
            visibleLinesHtml += `<div class="console-line ${lineData.type}" style="top: ${lineData.top}px;" data-index="${i}">[${lineData.timestamp}] ${escapedText}</div>`;
        }
        this.contentElement.innerHTML = visibleLinesHtml;

        const renderedElements = this.contentElement.querySelectorAll('.console-line');
        let heightHasChanged = false;

        renderedElements.forEach(element => {
            const index = parseInt(element.dataset.index, 10);
            const lineData = this.logLines[index];
            if (lineData && lineData.height === null) {
                const measuredHeight = element.offsetHeight;
                lineData.height = measuredHeight;
                heightHasChanged = true;
            }
        });

        if (heightHasChanged) {
            this.requestRender();
        }
    },

    isAtBottom: function() {
        if (!this.viewportElement) return true;
        const { scrollTop, scrollHeight, clientHeight } = this.viewportElement;
        return scrollHeight - scrollTop - clientHeight < (this.lineHeight * 2);
    },

    applySettings: function(settings) {
        if (!this.container || !settings) return;
        const shouldWrap = settings.wordWrap;
        const hasNoWrapClass = this.container.classList.contains('no-wrap');
        const shouldHaveNoWrapClass = !shouldWrap;

        if (hasNoWrapClass !== shouldHaveNoWrapClass) {
            this.container.classList.toggle('no-wrap', shouldHaveNoWrapClass);
            this.logLines.forEach(line => { line.height = null; });
            this.requestRender();
        }
    },

    escapeHtml: function(str) {
        return str.replace(/[&<>"']/g, match => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    }
};

export default ConsoleManager;