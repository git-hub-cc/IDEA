// terminal-emulator.js - 终端模拟逻辑
export class TerminalEmulator {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.xterm = null;
        this.fitAddon = null;
        this.currentLine = ''; // 当前输入行
        this.history = []; // 命令历史
        this.historyIndex = -1;
    }

    init() {
        // 将xterm.js和fitaddon的初始化放在DOMContentLoaded之后，并且检查全局变量
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
                console.warn('xterm.js or xterm-addon-fit is not loaded. Terminal will not work.');
                return;
            }

            this.xterm = new Terminal({
                cursorBlink: true,
                theme: {
                    background: '#282c34', // Monaco/VS Code默认终端背景色
                    foreground: '#abb2bf',
                    cursor: '#61afef'
                },
                convertEol: true // 自动换行
            });
            this.fitAddon = new FitAddon.FitAddon();
            this.xterm.loadAddon(this.fitAddon);

            this.xterm.open(this.container);
            this.fitAddon.fit(); // 适应容器大小

            // 暴露给全局，方便UI Manager调用layout
            window.xtermInstance = this.xterm;
            window.xtermFitAddon = this.fitAddon;

            this.xterm.write('Welcome to Web IDEA Terminal (Frontend Mock)\r\n');
            this.xterm.write('Type \'help\' for available commands.\r\n');
            this.prompt(); // 显示初始提示符

            this.setupInputListener();
        });
    }

    prompt() {
        this.xterm.write('$ ');
    }

    setupInputListener() {
        this.xterm.onKey(e => {
            const printable = !e.domEvent.altKey && !e.domEvent.altGraphKey && !e.domEvent.ctrlKey && !e.domEvent.metaKey;
            const event = e.domEvent;

            if (event.keyCode === 13) { // Enter key
                this.xterm.write('\r\n');
                const command = this.currentLine.trim();
                if (command) {
                    this.history.push(command);
                    this.historyIndex = this.history.length; // 重置历史索引
                    this.handleCommand(command);
                }
                this.currentLine = '';
                this.prompt();
            } else if (event.keyCode === 8) { // Backspace
                if (this.currentLine.length > 0) {
                    this.xterm.write('\b \b'); // Delete character on terminal
                    this.currentLine = this.currentLine.slice(0, -1);
                }
            } else if (event.keyCode === 38) { // Up Arrow
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.clearCurrentLine();
                    this.currentLine = this.history[this.historyIndex];
                    this.xterm.write(this.currentLine);
                }
            } else if (event.keyCode === 40) { // Down Arrow
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.clearCurrentLine();
                    this.currentLine = this.history[this.historyIndex];
                    this.xterm.write(this.currentLine);
                } else if (this.historyIndex === this.history.length - 1) { // 到了最新一条，清空
                    this.historyIndex++;
                    this.clearCurrentLine();
                    this.currentLine = '';
                }
            }
            else if (printable) {
                this.xterm.write(e.key);
                this.currentLine += e.key;
            }
        });
    }

    clearCurrentLine() {
        // 清除当前显示在终端上的输入行
        if (this.currentLine.length > 0) {
            this.xterm.write('\b'.repeat(this.currentLine.length)); // 回退光标
            this.xterm.write(' '.repeat(this.currentLine.length)); // 写入空格覆盖
            this.xterm.write('\b'.repeat(this.currentLine.length)); // 再次回退光标
        }
    }

    // 模拟命令行命令处理
    handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        switch (cmd) {
            case 'ls':
                this.xterm.write('src/ main/ resources/ pom.xml .gitignore\r\n');
                break;
            case 'clear':
                this.xterm.clear();
                break;
            case 'help':
                this.xterm.write('Available commands:\r\n');
                this.xterm.write('  ls         - List directory contents\r\n');
                this.xterm.write('  clear      - Clear the terminal screen\r\n');
                this.xterm.write('  echo [text] - Display a line of text\r\n');
                this.xterm.write('  whoami     - Display current user (mock)\r\n');
                this.xterm.write('  java -version - Display Java version (mock)\r\n');
                this.xterm.write('  help       - Show this help message\r\n');
                break;
            case 'echo':
                this.xterm.write(args.join(' ') + '\r\n');
                break;
            case 'whoami':
                this.xterm.write('web-idea-user (mock)\r\n');
                break;
            case 'java':
                if (args[0] === '-version') {
                    this.xterm.write('openjdk version "11.0.12" 2021-07-20 LTS\r\n');
                    this.xterm.write('OpenJDK Runtime Environment (build 11.0.12+7-LTS)\r\n');
                    this.xterm.write('OpenJDK 64-Bit Server VM (build 11.0.12+7-LTS, mixed mode)\r\n');
                } else {
                    this.xterm.write(`Error: Invalid java command or arguments: ${command}\r\n`);
                }
                break;
            default:
                this.xterm.write(`Command not found: ${command}\r\n`);
        }
    }
}