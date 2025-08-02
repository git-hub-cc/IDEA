// src/js/managers/TerminalManager.js - 终端管理器 (基于ANSI-to-HTML)

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

// AnsiUp 类是通过 <script> 标签在全局范围内加载的
const TerminalManager = {
    container: null,
    outputContainer: null,
    outputElement: null,
    inputElement: null,
    ansiUp: null,
    isInitialized: false,

    /**
     * @description 初始化终端管理器。
     * 它会获取必要的DOM元素，并设置事件监听器。
     * 真正的初始化工作（如启动后端会话）会延迟到终端面板首次被激活时进行。
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

        // 绑定应用事件
        this.bindAppEvents();

        // 如果终端是默认激活的标签页，则立即进行设置
        if (this.container.classList.contains('active')) {
            this.setupTerminal();
        }
    },

    /**
     * @description 绑定应用级事件监听器。
     */
    bindAppEvents: function() {
        // 监听底部面板标签页的切换事件
        EventBus.on('ui:activateBottomPanelTab', (panelId) => {
            if (panelId === 'terminal-panel') {
                // 如果是终端标签页，并且尚未初始化，则执行初始化
                if (!this.isInitialized) {
                    this.setupTerminal();
                }
                // 每次激活时都聚焦输入框，提升用户体验
                this.inputElement.focus();
            }
        });

        // 监听来自后端的终端数据流
        EventBus.on('terminal:data', this.write.bind(this));

        // 当项目切换时，清空终端内容并重启后端会话
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

        // 检查 ansi_up 库是否已通过 <script> 标签加载
        if (typeof AnsiUp === 'undefined') {
            this.write('错误: ansi_up.js 库未加载，终端无法渲染颜色。\n');
            // 创建一个模拟对象以防出错，仅做文本直通
            this.ansiUp = { ansi_to_html: (txt) => txt.replace(/</g, '<').replace(/>/g, '>') };
        } else {
            this.ansiUp = new AnsiUp();
            // 配置为使用CSS类进行样式化，而不是内联样式，这更高效且易于主题化
            this.ansiUp.use_classes = true;
        }

        // 监听输入框的键盘事件
        this.inputElement.addEventListener('keydown', this.handleInput.bind(this));

        this.clear();
        this.write('欢迎使用 Web IDEA 终端\r\n');

        // 请求后端启动一个新的终端会话
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

            // 将用户输入的命令发送到后端执行，必须带上换行符以模拟回车
            NetworkManager.sendTerminalInput(command + '\n');

            // 清空输入框，准备下一次输入
            this.inputElement.value = '';
        }
    },

    /**
     * @description 将后端发来的数据（可能包含ANSI转义码）转换为HTML并追加到输出区域。
     * @param {string} data - 从后端收到的原始字符串数据。
     */
    write: function(data) {
        if (!this.outputElement || !this.ansiUp) return;

        // 使用 ansi_up 库将ANSI码转换为带CSS类的HTML
        const html = this.ansiUp.ansi_to_html(data);

        // 使用 insertAdjacentHTML 高效地将新内容追加到<pre>标签的末尾
        this.outputElement.insertAdjacentHTML('beforeend', html);

        // 自动将滚动条滚动到底部，以显示最新的输出
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
     * 在这个轻量级版本中，布局由CSS Flexbox自动处理，所以此方法是空的。
     * 留在此处是为了保持API的一致性，以防未来需要。
     */
    resize: function() {
        // 不需要任何操作。
    }
};

export default TerminalManager;