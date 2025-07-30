// console-output.js - 控制台输出逻辑
export class ConsoleOutput {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.preElement = this.container.querySelector('pre');
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.preElement.textContent += `[${timestamp}] ${message}\n`;
        this.preElement.scrollTop = this.preElement.scrollHeight;
    }

    error(message) {
        this.log(`[ERROR] ${message}`);
        // 可以在这里添加额外的样式，例如让错误信息变红
        // 缺点是preElement.textContent会覆盖之前的样式
        // 更好的做法是每个log是一个span，然后给span加class
        // 但当前PreElement直接使用textContent是为了简化
    }
    // 清空控制台
    clear() {
        this.preElement.textContent = '';
    }
}