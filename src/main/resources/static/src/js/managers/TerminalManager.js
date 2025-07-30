// src/js/managers/TerminalManager.js - 终端模拟器管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const TerminalManager = {
    xterm: null,
    fitAddon: null,
    container: null,
    isInitialized: false,

    /**
     * @description 初始化终端管理器，准备进行延迟加载。
     */
    init: function() {
        this.container = document.getElementById('terminal-panel');

        // 监听Tab激活事件，以便在需要时才初始化终端
        EventBus.on('ui:activateBottomPanelTab', (panelId) => {
            if (panelId === 'terminal-panel' && !this.isInitialized) {
                this.setupTerminal();
            }
        });

        // 如果终端是默认的活动Tab，也需要立即初始化
        if (this.container.classList.contains('active') && !this.isInitialized) {
            this.setupTerminal();
        }
    },

    /**
     * @description 真正执行xterm.js的初始化和绑定。
     */
    setupTerminal: function() {
        if (this.isInitialized) return;

        // 在实际使用时再检查依赖是否存在
        if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
            console.error('xterm.js 脚本未能加载，终端功能将不可用。');
            this.container.innerHTML = '<div style="color: var(--color-error); padding: 10px;">错误：终端组件加载失败。</div>';
            return;
        }

        this.xterm = new Terminal({
            cursorBlink: true,
            theme: { background: '#282c34', foreground: '#abb2bf' },
            convertEol: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 13,
        });

        this.fitAddon = new FitAddon.FitAddon();
        this.xterm.loadAddon(this.fitAddon);

        this.xterm.open(this.container);
        this.fitAddon.fit();

        this.xterm.write('欢迎使用 Web IDEA 终端\r\n');

        this.bindEvents();

        // 请求后端启动一个新的终端会话
        NetworkManager.startTerminal();

        this.isInitialized = true;
        EventBus.emit('log:info', '终端已初始化。');
    },

    /**
     * @description 绑定事件。
     */
    bindEvents: function() {
        EventBus.on('terminal:resize', this.resize.bind(this));
        EventBus.on('terminal:data', this.write.bind(this));

        // 处理用户输入并发送到后端
        this.xterm.onData(data => {
            NetworkManager.sendTerminalInput(data);
        });
    },

    /**
     * @description 调整终端尺寸以适应容器。
     */
    resize: function() {
        if (this.fitAddon && this.isInitialized) {
            // 使用延时确保DOM渲染完毕
            setTimeout(() => this.fitAddon.fit(), 50);
        }
    },

    /**
     * @description 向终端写入数据。
     * @param {string} data - 要写入的数据。
     */
    write: function(data) {
        if (this.xterm && this.isInitialized) {
            this.xterm.write(data);
        }
    },

    applySettings: function(settings) {
        if (this.xterm) {
            this.xterm.setOption('fontSize', settings.fontSize);
            this.xterm.setOption('fontFamily', settings.editorFontFamily);
        }
    }
};

export default TerminalManager;