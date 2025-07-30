// src/js/managers/StatusBarManager.js - 状态栏信息更新管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const StatusBarManager = {
    statusLeft: null,
    fileInfo: null,
    cursorPos: null,
    encoding: null,
    fileType: null,
    gitBranch: null,
    unsavedIndicator: null,
    statusTimeout: null,

    progressIndicator: null,
    progressBar: null,
    progressLabel: null,

    init: function() {
        const container = document.getElementById('status-bar');
        this.statusLeft = container.querySelector('.status-left span');
        this.fileInfo = container.querySelector('#file-info');
        this.cursorPos = container.querySelector('#cursor-pos');
        this.encoding = container.querySelector('#encoding');
        this.fileType = container.querySelector('#file-type');
        this.gitBranch = container.querySelector('#git-branch');
        this.unsavedIndicator = container.querySelector('#unsaved-indicator');

        this.progressIndicator = document.getElementById('progress-indicator');
        this.progressBar = document.getElementById('progress-bar');
        this.progressLabel = document.getElementById('progress-label');

        this.bindAppEvents();
        this.updateStatus('就绪');
        this.updateGitStatus();
    },

    bindAppEvents: function() {
        EventBus.on('statusbar:updateStatus', this.updateStatus.bind(this));
        EventBus.on('statusbar:updateFileInfo', this.updateFileInfo.bind(this));
        EventBus.on('statusbar:updateCursorPos', this.updateCursorPos.bind(this));
        EventBus.on('statusbar:markUnsaved', this.markUnsaved.bind(this));
        EventBus.on('statusbar:clearFileInfo', this.clearFileInfo.bind(this));
        EventBus.on('git:statusChanged', this.updateGitStatus.bind(this));
        EventBus.on('network:websocketConnected', () => this.updateStatus('就绪'));
        EventBus.on('network:websocketDisconnected', (error) => this.updateStatus(`离线: ${error ? '连接已断开' : '未知错误'}`));
        EventBus.on('progress:start', this.showProgress.bind(this));
        EventBus.on('progress:update', this.updateProgress.bind(this));
        EventBus.on('progress:finish', this.hideProgress.bind(this));
    },

    showProgress: function({ message, total }) {
        this.progressLabel.textContent = message || `0 / ${total}`;
        this.progressBar.style.width = '0%';
        this.progressIndicator.style.display = 'flex';
    },

    updateProgress: function({ value, total, message }) {
        const percentage = total > 0 ? (value / total) * 100 : 0;
        this.progressBar.style.width = `${percentage}%`;
        this.progressLabel.textContent = message || `${value} / ${total}`;
    },

    hideProgress: function() {
        this.progressIndicator.style.display = 'none';
        this.updateStatus('就绪'); // Reset main status after progress is done
    },

    updateStatus: function(message, timeout = 0) {
        this.statusLeft.textContent = message;
        if (this.statusTimeout) clearTimeout(this.statusTimeout);
        if (timeout > 0) {
            this.statusTimeout = setTimeout(() => {
                // Do not override status if a progress bar is active
                if (this.progressIndicator.style.display === 'none') {
                    this.updateStatus('就绪');
                }
            }, timeout);
        }
    },

    updateFileInfo: function({ path, language, lineNumber, column }) {
        this.fileInfo.textContent = path.split('/').pop();
        this.fileType.textContent = language;
        this.updateCursorPos({ lineNumber, column });
        this.encoding.textContent = 'UTF-8';
    },

    clearFileInfo: function() {
        this.fileInfo.textContent = '未选择文件';
        this.fileType.textContent = 'Text';
        this.cursorPos.textContent = 'Ln 1, Col 1';
        this.markUnsaved(false);
    },

    updateCursorPos: function({ lineNumber, column }) {
        this.cursorPos.textContent = `行 ${lineNumber}, 列 ${column}`;
    },

    markUnsaved: function(isUnsaved) {
        this.unsavedIndicator.style.display = isUnsaved ? 'inline' : 'none';
    },

    updateGitStatus: async function() {
        try {
            const status = await NetworkManager.getGitStatus();
            const counts = status.counts;
            let statusText = '';
            if (counts.modified > 0) statusText += ` M:${counts.modified}`;
            if (counts.added > 0) statusText += ` A:${counts.added}`;
            if (counts.deleted > 0) statusText += ` D:${counts.deleted}`;
            if (counts.untracked > 0) statusText += ` U:${counts.untracked}`;
            if (counts.conflicting > 0) statusText += ` C:${counts.conflicting}`;
            this.gitBranch.innerHTML = `<i class="fas fa-code-branch"></i> ${status.currentBranch}${statusText}`;
        } catch (error) {
            this.gitBranch.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Git: 不可用`;
            EventBus.emit('log:warn', `无法获取Git状态: ${error.message}`);
        }
    }
};

export default StatusBarManager;