// problems-list.js - 问题列表逻辑
export class ProblemsList {
    constructor(containerId, eventBus) {
        this.container = document.getElementById(containerId);
        this.ulElement = this.container.querySelector('ul');
        this.eventBus = eventBus;
    }

    // 更新问题列表
    updateProblems(problems) {
        this.ulElement.innerHTML = ''; // 清空现有问题

        if (!problems || problems.length === 0) {
            this.ulElement.innerHTML = '<li>无问题</li>';
            return;
        }

        problems.forEach(problem => {
            const li = document.createElement('li');
            li.className = problem.type; // 'error', 'warning', 'info'
            const iconClass = this.getProblemIcon(problem.type);
            li.innerHTML = `<i class="${iconClass}"></i>${problem.type.toUpperCase()}: ${problem.message} (${problem.file}:${problem.line})`;

            // 添加点击事件，跳转到编辑器中的对应行
            li.addEventListener('click', () => {
                this.eventBus.emit('problemClicked', {
                    filePath: problem.file,
                    lineNumber: problem.line
                });
            });
            this.ulElement.appendChild(li);
        });
    }

    // 根据问题类型获取图标
    getProblemIcon(type) {
        switch (type) {
            case 'error': return 'fas fa-times-circle';
            case 'warning': return 'fas fa-exclamation-triangle';
            case 'info': return 'fas fa-info-circle';
            default: return 'fas fa-question-circle';
        }
    }

    // 清空问题列表
    clear() {
        this.ulElement.innerHTML = '<li>无问题</li>';
    }
}