// src/js/managers/StatusBarManager.js - 状态栏信息更新管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import Config from '../config.js';

/**
 * @description 负责管理和更新应用底部状态栏的所有信息，
 * 包括状态文本、文件信息、光标位置、Git状态和进度条。
 */
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

    /**
     * @description 初始化状态栏管理器。
     */
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
    },

    /**
     * @description 绑定所有相关的应用事件。
     */
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

    /**
     * @description 显示进度条。
     * @param {object} options - 进度条选项。
     * @param {string} options.message - 进度条旁边显示的文本。
     * @param {number} options.total - 进度总数。
     */
    showProgress: function({ message, total }) {
        this.progressLabel.textContent = message || `0 / ${total}`;
        this.progressBar.style.width = '0%';
        this.progressIndicator.style.display = 'flex';
        if (this.statusTimeout) clearTimeout(this.statusTimeout);
    },

    /**
     * @description 更新进度条的进度。
     * @param {object} options - 进度更新选项。
     * @param {number} options.value - 当前进度值。
     * @param {number} options.total - 总进度值。
     * @param {string} [options.message] - 可选的更新文本。
     */
    updateProgress: function({ value, total, message }) {
        const percentage = total > 0 ? (value / total) * 100 : 0;
        this.progressBar.style.width = `${percentage}%`;
        this.progressLabel.textContent = message || `${value} / ${total}`;
    },

    /**
     * @description 隐藏进度条。
     */
    hideProgress: function() {
        this.progressIndicator.style.display = 'none';
        this.updateStatus('就绪');
    },

    /**
     * @description 更新左侧的状态文本。
     * @param {string} message - 要显示的消息。
     * @param {number} [timeout=0] - 消息显示时长（毫秒），0表示永久显示。
     */
    updateStatus: function(message, timeout = 0) {
        this.statusLeft.textContent = message;
        if (this.statusTimeout) clearTimeout(this.statusTimeout);
        if (timeout > 0) {
            this.statusTimeout = setTimeout(function() {
                if (this.progressIndicator.style.display === 'none') {
                    this.updateStatus('就绪');
                }
            }.bind(this), timeout);
        }
    },

    /**
     * @description 更新文件相关信息。
     * @param {object} fileData - 文件数据。
     * @param {string} fileData.path - 文件路径。
     * @param {string} fileData.language - 文件语言。
     * @param {number} fileData.lineNumber - 当前行号。
     * @param {number} fileData.column - 当前列号。
     */
    updateFileInfo: function({ path, language, lineNumber, column }) {
        this.fileInfo.textContent = path.split('/').pop();
        this.fileType.textContent = language;
        this.updateCursorPos({ lineNumber, column });
        this.encoding.textContent = 'UTF-8';
    },

    /**
     * @description 清除文件相关信息，恢复到默认状态。
     */
    clearFileInfo: function() {
        this.fileInfo.textContent = '未选择文件';
        this.fileType.textContent = '文本';
        this.cursorPos.textContent = '行 1, 列 1';
        this.markUnsaved(false);
    },

    /**
     * @description 更新光标位置显示。
     * @param {object} pos - 光标位置。
     * @param {number} pos.lineNumber - 行号。
     * @param {number} pos.column - 列号。
     */
    updateCursorPos: function({ lineNumber, column }) {
        this.cursorPos.textContent = `行 ${lineNumber}, 列 ${column}`;
    },

    /**
     * @description 显示或隐藏未保存指示器（小圆点）。
     * @param {boolean} isUnsaved - 文件是否未保存。
     */
    markUnsaved: function(isUnsaved) {
        this.unsavedIndicator.style.display = isUnsaved ? 'inline' : 'none';
    },

    /**
     * @description 异步获取并更新Git状态信息。
     */
    updateGitStatus: async function() {
        if (!Config.currentProject) {
            this.gitBranch.innerHTML = `<i class="fas fa-code-branch"></i> 无项目`;
            return;
        }

        try {
            const status = await NetworkManager.getGitStatus();

            if (status.currentBranch === 'not-a-repo') {
                this.gitBranch.innerHTML = `<i class="fas fa-code-branch"></i> 非Git仓库`;
                EventBus.emit('log:info', `Git状态: 当前项目不是一个Git仓库。`);
                return;
            }

            const counts = status.counts;
            let statusText = '';
            if (counts.modified > 0) statusText += ` M:${counts.modified}`;
            if (counts.added > 0) statusText += ` A:${counts.added}`;
            if (counts.deleted > 0) statusText += ` D:${counts.deleted}`;
            if (counts.untracked > 0) statusText += ` U:${counts.untracked}`;
            if (counts.conflicting > 0) statusText += ` C:${counts.conflicting}`;
            this.gitBranch.innerHTML = `<i class="fas fa-code-branch"></i> ${status.currentBranch}${statusText}`;
        } catch (error) {
            this.gitBranch.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Git不可用`;
            EventBus.emit('log:warn', `无法获取Git状态: ${error.message}`);
        }
    }
};

export default StatusBarManager;