// status-bar.js - 状态栏信息更新逻辑
export class StatusBar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.statusLeft = this.container.querySelector('.status-left span');
        this.fileInfo = this.container.querySelector('#file-info');
        this.cursorPos = this.container.querySelector('#cursor-pos');
        this.encoding = this.container.querySelector('#encoding');
        this.fileType = this.container.querySelector('#file-type');
        this.gitBranch = this.container.querySelector('#git-branch');
        this.unsavedIndicator = this.container.querySelector('#unsaved-indicator');
    }

    // 更新左侧状态文本
    updateStatus(message) {
        this.statusLeft.textContent = message;
    }

    // 更新文件信息
    updateFileInfo(name, type, line, col) {
        this.fileInfo.textContent = name;
        this.fileType.textContent = type;
        this.updateCursorPos(line, col);
        this.updateEncoding('UTF-8'); // 默认UTF-8
    }

    // 更新光标位置
    updateCursorPos(lineNumber, column) {
        this.cursorPos.textContent = `Ln ${lineNumber}, Col ${column}`;
    }

    // 更新编码
    updateEncoding(encoding) {
        this.encoding.textContent = encoding;
    }

    // 更新文件类型 (例如 Java, HTML)
    updateFileType(type) {
        this.fileType.textContent = type;
    }

    // 更新Git分支信息和状态计数
    updateGitBranch(branch, counts = { modified: 0, added: 0, deleted: 0 }) {
        let statusText = '';
        if (counts.modified > 0) statusText += ` M:${counts.modified}`;
        if (counts.added > 0) statusText += ` A:${counts.added}`;
        if (counts.deleted > 0) statusText += ` D:${counts.deleted}`;
        this.gitBranch.innerHTML = `<i class="fas fa-code-branch"></i> ${branch}${statusText}`;
    }

    // 标记文件是否未保存
    markUnsaved(isUnsaved) {
        this.unsavedIndicator.style.display = isUnsaved ? 'inline' : 'none';
    }
}