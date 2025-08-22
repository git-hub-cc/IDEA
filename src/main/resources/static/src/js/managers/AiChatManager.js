// src/js/managers/AiChatManager.js - AI 聊天面板管理器

import EventBus from '../utils/event-emitter.js';
import TemplateLoader from '../utils/TemplateLoader.js';
import NetworkManager from './NetworkManager.js';
import CodeEditorManager from './CodeEditorManager.js';

/**
 * @description 管理AI聊天面板的所有UI和逻辑。
 */
const AiChatManager = {
    panel: null,
    historyContainer: null,
    form: null,
    input: null,
    sendBtn: null,
    isVisible: false,
    isThinking: false,
    storageKey: 'aiChatHistory',

    /**
     * @description 初始化AI聊天管理器。
     */
    init: function() {
        this.panel = document.getElementById('ai-chat-panel');
        if (!this.panel) {
            console.error('AI聊天面板元素未找到！');
            return;
        }

        this.renderPanel();
        this.bindDOMEvents();
        this.loadHistory();
        this.updateVisibility();
    },

    /**
     * @description 渲染AI聊天面板的初始内部结构。
     */
    renderPanel: function() {
        const template = TemplateLoader.get('ai-chat-panel-template');
        if (template) {
            this.panel.appendChild(template);
            this.historyContainer = this.panel.querySelector('#ai-chat-history');
            this.form = this.panel.querySelector('#ai-chat-form');
            this.input = this.panel.querySelector('#ai-chat-input');
            this.sendBtn = this.panel.querySelector('#ai-chat-send-btn');
            this.panel.querySelector('[data-action="clear-ai-chat"]')
                .addEventListener('click', () => EventBus.emit('action:clear-ai-chat'));
        }
    },

    /**
     * @description 绑定与AI聊天面板相关的DOM事件。
     */
    bindDOMEvents: function() {
        if (!this.form || !this.input) return;

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.input.addEventListener('input', this.autoResizeTextarea);
    },

    /**
     * @description 切换AI聊天面板的可见性。
     */
    toggleVisibility: function() {
        this.isVisible = !this.isVisible;
        this.updateVisibility();
        EventBus.emit('ui:layoutChanged');
    },

    /**
     * @description 根据 `isVisible` 状态更新DOM。
     */
    updateVisibility: function() {
        if (this.panel) {
            this.panel.style.display = this.isVisible ? 'flex' : 'none';
        }
    },

    /**
     * @description 发送用户消息。
     */
    sendMessage: async function() {
        const userMessage = this.input.value.trim();
        if (!userMessage || this.isThinking) return;

        // ========================= 修改 START =========================
        // 1. 从 localStorage 获取AI配置
        const apiKey = localStorage.getItem('ai_api_key');
        const apiEndpoint = localStorage.getItem('ai_api_endpoint');
        const model = localStorage.getItem('ai_model');

        // 2. 验证配置是否存在
        if (!apiKey || !apiEndpoint || !model) {
            EventBus.emit('modal:showConfirm', {
                title: 'AI 未配置',
                message: 'AI 聊天功能需要配置 API 密钥、端点和模型。是否现在前往设置？',
                confirmText: '前往设置',
                onConfirm: () => EventBus.emit('action:settings', 'ai-settings-pane')
            });
            return;
        }
        // ========================= 修改 END ===========================

        this.setThinkingState(true);

        this.addMessageToHistory('user', userMessage);
        this.saveHistory();
        this.input.value = '';
        this.autoResizeTextarea();

        const aiMessageElement = this.addMessageToHistory('ai', this.getThinkingIndicatorHTML());
        this.scrollToBottom();

        try {
            const contextCode = CodeEditorManager.getSelectedText();
            // ========================= 修改 START =========================
            // 3. 将配置信息包含在请求体中
            const requestPayload = {
                userMessage,
                contextCode,
                apiKey,
                apiEndpoint,
                model
            };
            const response = await NetworkManager.getAiChatCompletion(requestPayload);
            // ========================= 修改 END ===========================

            this.updateMessageContent(aiMessageElement, response.aiMessage);
            this.saveHistory();
        } catch (error) {
            // 解析后端返回的结构化错误信息
            let displayError = "请求失败，请检查控制台获取详细信息。";
            try {
                const errorBody = JSON.parse(error.message.substring(error.message.indexOf('{')));
                displayError = `抱歉，请求失败了。错误: ${errorBody.error || errorBody.message}`;
            } catch (e) {
                displayError = `抱歉，请求失败了。错误: ${error.message}`;
            }
            this.updateMessageContent(aiMessageElement, displayError);
            this.saveHistory();
            EventBus.emit('log:error', `AI chat request failed: ${error.message}`);
        } finally {
            this.setThinkingState(false);
            this.scrollToBottom();
        }
    },

    /**
     * @description 设置面板的“思考中”状态。
     * @param {boolean} isThinking - 是否正在等待AI响应。
     */
    setThinkingState: function(isThinking) {
        this.isThinking = isThinking;
        this.input.disabled = isThinking;
        this.sendBtn.disabled = isThinking;
        this.input.placeholder = isThinking ? 'AI 正在思考...' : '输入消息 (Shift+Enter 换行)...';
    },

    /**
     * @description 将一条新消息添加到聊天历史记录的UI中。
     * @param {'user' | 'ai'} role - 消息发送者的角色。
     * @param {string} content - 消息内容 (HTML)。
     * @returns {HTMLElement} 创建的消息元素。
     */
    addMessageToHistory: function(role, content) {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${role}-message`;
        messageElement.innerHTML = `<div class="message-content">${content}</div>`;
        this.historyContainer.appendChild(messageElement);
        this.scrollToBottom();
        return messageElement;
    },

    /**
     * @description 更新指定消息元素的内容。
     * @param {HTMLElement} element - 要更新的消息元素。
     * @param {string} newContent - 新的HTML内容。
     */
    updateMessageContent: function(element, newContent) {
        const contentElement = element.querySelector('.message-content');
        if (contentElement) {
            contentElement.innerHTML = this.simpleMarkdownToHtml(newContent);
        }
    },

    /**
     * @description 简单的Markdown到HTML转换器，主要处理代码块。
     * @param {string} text - Markdown文本。
     * @returns {string} 转换后的HTML。
     */
    simpleMarkdownToHtml: function(text) {
        const processedText = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const escapedCode = code.replace(/[&<>"']/g, (m) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[m]));
            return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
        });

        const parts = processedText.split(/(<pre>[\s\S]*?<\/pre>)/);
        return parts.map(part => {
            if (part.startsWith('<pre>')) { return part; }
            return part
                .replace(/[&<>"']/g, (m) => ({'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'})[m])
                .replace(/\n/g, '<br>');
        }).join('');
    },


    /**
     * @description 获取“正在思考”加载指示器的HTML。
     * @returns {string}
     */
    getThinkingIndicatorHTML: function() {
        return '<span class="thinking-indicator dot1"></span>' +
            '<span class="thinking-indicator dot2"></span>' +
            '<span class="thinking-indicator dot3"></span>';
    },

    /**
     * @description 将聊天记录滚动到底部。
     */
    scrollToBottom: function() {
        if (this.historyContainer) {
            this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
        }
    },

    /**
     * @description 自动调整文本框的高度以适应内容。
     */
    autoResizeTextarea: function() {
        const textarea = AiChatManager.input;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    },

    /**
     * @description 清空聊天历史记录。
     */
    clearHistory: function() {
        this.historyContainer.innerHTML = '';
        localStorage.removeItem(this.storageKey);
        this.addMessageToHistory('ai', '<p>你好！有什么可以帮你的吗？</p>');
    },

    /**
     * @description 保存当前聊天记录到localStorage。
     */
    saveHistory: function() {
        const messages = Array.from(this.historyContainer.querySelectorAll('.chat-message')).map(el => ({
            role: el.classList.contains('user-message') ? 'user' : 'ai',
            content: el.querySelector('.message-content').innerHTML
        }));
        localStorage.setItem(this.storageKey, JSON.stringify(messages));
    },

    /**
     * @description 从localStorage加载聊天记录。
     */
    loadHistory: function() {
        const savedHistory = localStorage.getItem(this.storageKey);
        if (savedHistory) {
            try {
                const messages = JSON.parse(savedHistory);
                this.historyContainer.innerHTML = '';
                messages.forEach(msg => {
                    if (!msg.content.includes('thinking-indicator')) {
                        this.addMessageToHistory(msg.role, msg.content);
                    }
                });
            } catch (e) {
                console.error('加载AI聊天记录失败:', e);
                localStorage.removeItem(this.storageKey);
            }
        }
    }
};

export default AiChatManager;