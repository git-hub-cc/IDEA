// src/js/managers/DebugConsoleManager.js - 调试器专用的控制台管理器

import EventBus from '../utils/event-emitter.js';
import TemplateLoader from '../utils/TemplateLoader.js';
import DebuggerManager from './DebuggerManager.js';

/**
 * @description 管理“调试”面板内的日志输出。
 * 它是 ConsoleManager 的一个专门版本，仅在调试会话激活时显示日志。
 */
const DebugConsoleManager = {
    container: null,
    viewportElement: null,
    contentElement: null,
    toolbarElement: null,
    scrollLockBtn: null,
    clearBtn: null,
    wrapBtn: null,

    isSoftWrapEnabled: true,
    isScrollLockEnabled: true,
    logLines: [],
    maxLines: 2000,
    lineHeight: 18,
    renderRequest: null,

    /**
     * @description 初始化调试器控制台管理器。
     */
    init: function() {
        this.container = document.getElementById('debugger-console-panel');
        if (!this.container) return;

        const viewportFragment = TemplateLoader.get('debugger-console-viewport-template');
        if (viewportFragment) {
            this.container.appendChild(viewportFragment);
        }

        this.viewportElement = this.container.querySelector('.debugger-console-viewport');
        this.contentElement = this.container.querySelector('.debugger-console-content');
        this.toolbarElement = this.container.querySelector('.debugger-console-toolbar');

        if (this.toolbarElement) {
            this.scrollLockBtn = this.toolbarElement.querySelector('[data-action="scroll-lock"]');
            this.clearBtn = this.toolbarElement.querySelector('[data-action="clear-console"]');
            this.wrapBtn = this.toolbarElement.querySelector('[data-action="toggle-wrap"]');
            this.bindToolbarEvents();
        }

        this.bindAppEvents();
        EventBus.on('app:ready', () => this.measureLineHeight());

        this.viewportElement.addEventListener('scroll', () => {
            if (!this.isAtBottom()) {
                if (this.isScrollLockEnabled) {
                    this.isScrollLockEnabled = false;
                    this.scrollLockBtn.classList.remove('active');
                }
            }
            this.requestRender();
        }, { passive: true });

        this.clear();
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        EventBus.on('raw:build-log', (message) => {
            if (DebuggerManager.isDebugging) this.log(message);
        });
        EventBus.on('raw:run-log', (message) => {
            if (DebuggerManager.isDebugging) this.log(message);
        });
        EventBus.on('debugger:eventReceived', (event) => {
            if (event.type === 'STARTED') {
                this.clear();
            }
        });
    },

    /**
     * @description 为工具栏按钮绑定事件。
     */
    bindToolbarEvents: function() {
        this.scrollLockBtn.addEventListener('click', () => {
            this.isScrollLockEnabled = !this.isScrollLockEnabled;
            this.scrollLockBtn.classList.toggle('active', this.isScrollLockEnabled);
            if (this.isScrollLockEnabled) this.scrollToBottom();
        });
        this.clearBtn.addEventListener('click', () => this.clear());
        this.wrapBtn.addEventListener('click', () => {
            this.isSoftWrapEnabled = !this.isSoftWrapEnabled;
            this.applySoftWrap();
        });
    },

    /**
     * @description 应用自动换行设置。
     */
    applySoftWrap: function() {
        this.wrapBtn.classList.toggle('active', this.isSoftWrapEnabled);
        this.container.classList.toggle('no-wrap', !this.isSoftWrapEnabled);
        this.logLines.forEach(line => { line.height = null; });
        this.requestRender();
    },

    /**
     * @description 动态测量行高。
     */
    measureLineHeight: function() {
        const tempLine = document.createElement('div');
        tempLine.className = 'console-line';
        tempLine.style.position = 'absolute';
        tempLine.style.visibility = 'hidden';
        tempLine.textContent = 'M';
        this.contentElement.appendChild(tempLine);
        this.lineHeight = tempLine.offsetHeight || 18;
        this.contentElement.removeChild(tempLine);
    },

    log: function(message, type = 'log') {
        const timestamp = new Date().toLocaleTimeString();
        const lines = String(message).split('\n');
        lines.forEach(line => {
            this.logLines.push({ text: line, timestamp, type, height: null, top: null });
        });
        if (this.logLines.length > this.maxLines) {
            this.logLines.splice(0, this.logLines.length - this.maxLines);
        }
        this.requestRender();
        if (this.isScrollLockEnabled) this.scrollToBottom();
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
        if (!this.viewportElement || !this.contentElement) return;
        let currentTop = 0;
        this.logLines.forEach(line => {
            line.top = currentTop;
            currentTop += line.height || this.lineHeight;
        });
        this.contentElement.style.height = `${currentTop}px`;

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
            const line = this.logLines[i];
            const escapedText = this.escapeHtml(line.text);
            visibleLinesHtml += `<div class="console-line ${line.type}" style="top: ${line.top}px;" data-index="${i}">[${line.timestamp}] ${escapedText}</div>`;
        }
        this.contentElement.innerHTML = visibleLinesHtml;

        let heightChanged = false;
        this.contentElement.querySelectorAll('.console-line').forEach(el => {
            const index = parseInt(el.dataset.index, 10);
            const lineData = this.logLines[index];
            if (lineData && lineData.height === null) {
                lineData.height = el.offsetHeight;
                heightChanged = true;
            }
        });
        if (heightChanged) this.requestRender();
    },

    isAtBottom: function() {
        if (!this.viewportElement) return true;
        const { scrollTop, scrollHeight, clientHeight } = this.viewportElement;
        return scrollHeight - scrollTop - clientHeight < (this.lineHeight * 2);
    },

    scrollToBottom: function() {
        requestAnimationFrame(() => {
            if (this.viewportElement) {
                this.viewportElement.scrollTo({ top: this.viewportElement.scrollHeight, behavior: 'smooth' });
            }
        });
    },

    escapeHtml: (str) => str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match])
};

export default DebugConsoleManager;