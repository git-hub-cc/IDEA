// debugger-panel.js - 调试器面板逻辑
export class DebuggerPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.variablesList = this.container.querySelector('#debugger-variables');
        this.callStackList = this.container.querySelector('#debugger-call-stack');
        this.clearDebuggerInfo(); // 初始清空
    }

    // 显示调试信息
    showDebuggerInfo(info) {
        this.clearDebuggerInfo(); // 清空旧信息

        // 渲染变量
        if (info.variables && info.variables.length > 0) {
            info.variables.forEach(v => {
                const li = document.createElement('li');
                li.textContent = `${v.name}: ${JSON.stringify(v.value)} (${v.type})`;
                this.variablesList.appendChild(li);
            });
        } else {
            this.variablesList.innerHTML = '<li>无变量信息</li>';
        }

        // 渲染调用栈
        if (info.callStack && info.callStack.length > 0) {
            info.callStack.forEach((s, index) => {
                const li = document.createElement('li');
                li.textContent = `${index === 0 ? '▶ ' : ''}${s.method} at ${s.file}:${s.line}`;
                if (index === 0) { // 模拟当前执行的栈帧高亮
                    li.classList.add('highlight');
                }
                this.callStackList.appendChild(li);
            });
        } else {
            this.callStackList.innerHTML = '<li>无调用栈信息</li>';
        }
    }

    // 更新单个变量 (模拟变量值变化时的动画)
    updateVariable(name, newValue) {
        const existingVar = Array.from(this.variablesList.children).find(li => li.textContent.startsWith(`${name}:`));
        if (existingVar) {
            existingVar.textContent = `${name}: ${JSON.stringify(newValue)}`;
            existingVar.classList.add('highlight'); // 模拟高亮变化
            setTimeout(() => existingVar.classList.remove('highlight'), 500);
        } else {
            // 如果变量不存在，则添加
            const li = document.createElement('li');
            li.textContent = `${name}: ${JSON.stringify(newValue)}`;
            li.classList.add('highlight');
            this.variablesList.appendChild(li);
            setTimeout(() => li.classList.remove('highlight'), 500);
        }
    }

    // 清空调试信息
    clearDebuggerInfo() {
        this.variablesList.innerHTML = '<li>无信息</li>';
        this.callStackList.innerHTML = '<li>无信息</li>';
    }
}