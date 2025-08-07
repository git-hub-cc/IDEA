// src/js/managers/TerminalManager.js - 终端管理器 (基于ANSI-to-HTML)

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

/**
 * @description 管理“终端”面板的功能。它通过 WebSocket 与后端 PTY (伪终端)
 * 会话进行通信，并使用 ansi_up.js 库将包含ANSI转义码的输出转换为带样式的HTML。
 */
const TerminalManager = {
    container: null,
    outputContainer: null,
    outputElement: null,
    inputElement: null,
    ansiUp: null,
    isInitialized: false,

    /**
     * @description 初始化终端管理器。
     * 真正的设置工作会延迟到终端面板首次被激活时进行。
     */
    init: function() {
        this.container = document.getElementById('terminal-panel');
        this.outputContainer = document.getElementById('terminal-output-container');
        this.outputElement = document.getElementById('terminal-output');
        this.inputElement = document.getElementById('terminal-input');

        if (!this.container || !this.outputContainer || !this.outputElement || !this.inputElement) {
            console.error("致命错误: 终端的核心DOM元素未找到。");
            return;
        }

        this.bindAppEvents();

        if (this.container.classList.contains('active')) {
            this.setupTerminal();
        }
    },

    /**
     * @description 绑定应用级事件监听器。
     */
    bindAppEvents: function() {
        // 监听底部面板标签页的切换事件以进行惰性初始化
        EventBus.on('ui:activateBottomPanelTab', (panelId) => {
            if (panelId === 'terminal-panel') {
                if (!this.isInitialized) {
                    this.setupTerminal();
                }
                this.inputElement.focus();
            }
        });

        EventBus.on('terminal:data', this.write.bind(this));
        EventBus.on('project:activated', () => {
            if (this.isInitialized) {
                this.clear();
                NetworkManager.startTerminal(); // 为新项目启动新的终端会话
            }
        });
    },

    /**
     * @description 执行终端的首次设置。
     * 包括实例化ANSI转换器、绑定输入事件和启动后端会话。
     */
    setupTerminal: function() {
        if (this.isInitialized) return;

        if (typeof AnsiUp === 'undefined') {
            this.write('错误: ansi_up.js 库未加载，终端无法渲染颜色。\n');
            this.ansiUp = { ansi_to_html: (txt) => txt.replace(/</g, '<').replace(/>/g, '>') };
        } else {
            this.ansiUp = new AnsiUp();
            this.ansiUp.use_classes = true; // 使用CSS类进行样式化，而非内联样式
        }

        this.inputElement.addEventListener('keydown', this.handleInput.bind(this));
        this.clear();
        this.write('欢迎使用 Web IDEA 终端\r\n');

        NetworkManager.startTerminal();
        this.isInitialized = true;
        EventBus.emit('log:info', '轻量级终端已初始化。');
    },

    /**
     * @description 处理用户在输入框中的按键事件，特别是回车键。
     * @param {KeyboardEvent} event - 键盘事件对象。
     */
    handleInput: function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const command = this.inputElement.value;
            // 发送到后端的命令必须带上换行符以模拟回车
            NetworkManager.sendTerminalInput(command + '\n');
            this.inputElement.value = '';
        }
    },

    /**
     * @description 将后端发来的数据转换为HTML并追加到输出区域。
     * @param {string} data - 从后端收到的原始字符串数据。
     */
    write: function(data) {
        if (!this.outputElement || !this.ansiUp) return;
        const html = this.ansiUp.ansi_to_html(data);
        this.outputElement.insertAdjacentHTML('beforeend', html);
        // 自动滚动到底部以显示最新输出
        this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
    },

    /**
     * @description 清空终端的输出内容。
     */
    clear: function() {
        if (this.outputElement) {
            this.outputElement.innerHTML = '';
        }
    },

    /**
     * @description 终端大小调整事件。
     * 在此实现中，布局由CSS Flexbox自动处理，故此方法为空。
     */
    resize: function() {
        // 无需执行任何操作。
    }
};

export default TerminalManager;