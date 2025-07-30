// src/js/managers/ActionManager.js - 应用行为协调器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from './NetworkManager.js';
import FileTreeManager from './FileTreeManager.js';

const ActionManager = {
    /**
     * @description 初始化动作管理器，绑定所有 action:* 事件。
     */
    init: function() {
        this.bindAppEvents();
    },

    bindAppEvents: function() {
        // --- 基本文件操作 ---
        EventBus.on('action:new-file', () => this.handleNewFile());
        EventBus.on('action:open-folder', this.handleOpenFolder.bind(this));
        EventBus.on('action:save-file', this.handleSaveFile.bind(this));

        // --- 构建与调试 ---
        EventBus.on('action:run-code', this.handleRunCode.bind(this));
        EventBus.on('action:debug-code', this.handleDebugCode.bind(this));

        // --- 调试器控制 ---
        EventBus.on('action:step-over', NetworkManager.stepOver);
        EventBus.on('action:step-into', NetworkManager.stepInto);
        EventBus.on('action:step-out', NetworkManager.stepOut);
        EventBus.on('action:resume-debug', NetworkManager.resumeDebug);
        EventBus.on('action:stop-debug', NetworkManager.stopDebug);

        // --- VCS (Git) ---
        EventBus.on('action:vcs-commit', this.handleVCSCommit.bind(this));
        EventBus.on('action:vcs-pull', this.handleVCSPull.bind(this));
        EventBus.on('action:vcs-push', this.handleVCSPush.bind(this));

        // --- 其他全局动作 ---
        EventBus.on('action:settings', this.handleSettings.bind(this));
        EventBus.on('action:about', this.handleAbout.bind(this));

        // --- 文件树右键菜单动作 ---
        EventBus.on('context-action:new-file', ({ path }) => this.handleNewFile(path, 'folder'));
        EventBus.on('context-action:new-folder', ({ path }) => this.handleNewFolder(path));
        EventBus.on('context-action:rename', ({ path, type }) => this.handleRenamePath(path, type));
        EventBus.on('context-action:delete', this.handleDeletePath.bind(this));
    },

    /**
     * @description 获取当前文件创建的上下文路径。
     * @returns {string} 目标父目录的路径。
     */
    _getCreationContextPath: function() {
        const focusedItem = FileTreeManager.getFocusedItem();
        if (!focusedItem) {
            return ''; // 没有焦点，则返回根目录
        }

        if (focusedItem.type === 'folder') {
            return focusedItem.path; // 焦点是文件夹，直接使用其路径
        } else {
            // 焦点是文件，使用其父目录的路径
            const pathParts = focusedItem.path.split('/');
            pathParts.pop();
            return pathParts.join('/');
        }
    },

    handleNewFile: function(contextPath, contextType) {
        const parentPath = (contextType === 'folder' && contextPath) ? contextPath : this._getCreationContextPath();
        const displayPath = parentPath || '项目根目录';

        EventBus.emit('modal:showPrompt', {
            title: '新建文件',
            message: `在 ${displayPath} 中新建文件，请输入文件名:`,
            onConfirm: async (name) => {
                if (!name) return;
                try {
                    await NetworkManager.createFileOrDir(parentPath, name, 'file');
                    EventBus.emit('log:info', `文件 '${name}' 创建成功。`);
                    EventBus.emit('filesystem:changed');
                    const newFilePath = parentPath ? `${parentPath}/${name}` : name;
                    EventBus.emit('file:openRequest', newFilePath);
                } catch (error) {
                    EventBus.emit('log:error', `创建文件失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '错误', message: `创建失败: ${error.message}` });
                }
            }
        });
    },

    handleNewFolder: function(contextPath) {
        const parentPath = contextPath || this._getCreationContextPath();
        const displayPath = parentPath || '项目根目录';

        EventBus.emit('modal:showPrompt', {
            title: '新建文件夹',
            message: `在 ${displayPath} 中新建文件夹，请输入文件夹名:`,
            onConfirm: async (name) => {
                if (!name) return;
                try {
                    await NetworkManager.createFileOrDir(parentPath, name, 'folder');
                    EventBus.emit('log:info', `文件夹 '${name}' 创建成功。`);
                    EventBus.emit('filesystem:changed');
                } catch (error) {
                    EventBus.emit('log:error', `创建文件夹失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '错误', message: `创建失败: ${error.message}` });
                }
            }
        });
    },

    handleOpenFolder: async function() {
        if (!('showDirectoryPicker' in window)) {
            EventBus.emit('modal:showAlert', {
                title: '浏览器不支持',
                message: '您的浏览器不支持文件夹选择功能。请使用最新的Chrome、Edge或Opera浏览器。'
            });
            return;
        }

        EventBus.emit('modal:showConfirm', {
            title: '打开新项目',
            message: '这将替换当前工作区的所有内容。所有未保存的更改将丢失。您确定要继续吗？',
            onConfirm: async () => {
                try {
                    const directoryHandle = await window.showDirectoryPicker();
                    await NetworkManager.uploadProject(directoryHandle);
                    EventBus.emit('modal:showAlert', { title: '成功', message: '项目已成功加载！' });
                } catch (error) {
                    if (error.name === 'AbortError') {
                        EventBus.emit('log:info', '用户取消了文件夹选择。');
                        return;
                    }
                    EventBus.emit('log:error', `打开文件夹失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '打开失败', message: `无法加载项目: ${error.message}` });
                }
            }
        });
    },

    handleRenamePath: function(path, type) {
        const oldName = path.split('/').pop();
        EventBus.emit('modal:showPrompt', {
            title: `重命名 ${type === 'folder' ? '文件夹' : '文件'}`,
            message: `输入新的名称以重命名 '${oldName}':`,
            defaultValue: oldName,
            onConfirm: async (newName) => {
                if (!newName || newName === oldName) return;
                try {
                    await NetworkManager.renamePath(path, newName);
                    EventBus.emit('log:info', `'${oldName}' 已重命名为 '${newName}'。`);
                    EventBus.emit('filesystem:changed');
                } catch (error) {
                    EventBus.emit('log:error', `重命名失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '错误', message: `重命名失败: ${error.message}` });
                }
            }
        });
    },

    handleSaveFile: function() {
        EventBus.emit('file:saveRequest');
    },

    handleRunCode: async function() {
        EventBus.emit('ui:activateBottomPanelTab', 'console-output');
        EventBus.emit('console:clear');
        EventBus.emit('statusbar:updateStatus', '构建与运行中...');
        try {
            await NetworkManager.buildProject(Config.CURRENT_PROJECT_PATH);
            EventBus.emit('log:info', '构建与运行请求已发送。');
        } catch (error) {
            EventBus.emit('log:error', `构建请求失败: ${error.message}`);
            EventBus.emit('statusbar:updateStatus', '构建失败', 2000);
        }
    },

    handleDebugCode: async function() {
        EventBus.emit('ui:activateBottomPanelTab', 'debugger-panel');
        EventBus.emit('debugger:clear');
        EventBus.emit('console:clear');
        EventBus.emit('statusbar:updateStatus', '启动调试器...');
        try {
            await NetworkManager.startDebug(Config.CURRENT_PROJECT_PATH, Config.MAIN_CLASS_PATH);
            EventBus.emit('log:info', '调试会话启动请求已发送。');
        } catch (error) {
            EventBus.emit('log:error', `启动调试失败: ${error.message}`);
            EventBus.emit('statusbar:updateStatus', '调试失败', 2000);
        }
    },

    handleVCSCommit: function() {
        EventBus.emit('modal:showPrompt', {
            title: 'Git 提交',
            message: '请输入提交信息:',
            onConfirm: async (message) => {
                if (!message) return;
                EventBus.emit('statusbar:updateStatus', '正在提交...');
                try {
                    const result = await NetworkManager.gitCommit(message);
                    EventBus.emit('log:info', `提交成功: ${result}`);
                    EventBus.emit('statusbar:updateStatus', '提交成功!', 2000);
                    EventBus.emit('git:statusChanged');
                } catch (error) {
                    EventBus.emit('log:error', `提交失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: 'Git 提交失败', message: error.message });
                    EventBus.emit('statusbar:updateStatus', '提交失败', 2000);
                }
            }
        });
    },

    handleVCSPull: async function() {
        EventBus.emit('statusbar:updateStatus', '正在拉取...');
        try {
            const result = await NetworkManager.gitPull();
            EventBus.emit('log:info', `拉取操作: ${result}`);
            EventBus.emit('modal:showAlert', { title: 'Git 拉取', message: result });
            EventBus.emit('statusbar:updateStatus', '拉取成功!', 2000);
            EventBus.emit('filesystem:changed');
            EventBus.emit('git:statusChanged');
        } catch (error) {
            EventBus.emit('log:error', `拉取失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: 'Git 拉取失败', message: error.message });
            EventBus.emit('statusbar:updateStatus', '拉取失败', 2000);
        }
    },

    handleVCSPush: async function() {
        EventBus.emit('statusbar:updateStatus', '正在推送...');
        try {
            const result = await NetworkManager.gitPush();
            EventBus.emit('log:info', `推送操作: ${result}`);
            EventBus.emit('modal:showAlert', { title: 'Git 推送', message: result });
            EventBus.emit('statusbar:updateStatus', '推送成功!', 2000);
        } catch (error) {
            EventBus.emit('log:error', `推送失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: 'Git 推送失败', message: error.message });
            EventBus.emit('statusbar:updateStatus', '推送失败', 2000);
        }
    },

    handleSettings: async function() {
        try {
            const currentSettings = await NetworkManager.getSettings();
            EventBus.emit('modal:showSettings', currentSettings);
        } catch (error) {
            EventBus.emit('log:error', `加载设置失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '错误', message: '无法加载设置。' });
        }
    },

    handleAbout: function() {
        EventBus.emit('modal:showAlert', {
            title: '关于 Web IDEA',
            message: '这是一个基于Vanilla JS和ES6模块构建的IDE原型。\n版本: 2.3.0-final'
        });
    },

    handleDeletePath: function({ path }) {
        EventBus.emit('modal:showConfirm', {
            title: '确认删除',
            message: `您确定要删除 '${path}' 吗？此操作不可撤销。`,
            onConfirm: async () => {
                try {
                    await NetworkManager.deletePath(path);
                    EventBus.emit('log:info', `路径 '${path}' 已被删除。`);
                    EventBus.emit('filesystem:changed');
                    EventBus.emit('file:closeRequest', path);
                } catch(error) {
                    EventBus.emit('log:error', `删除失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '删除失败', message: error.message });
                }
            }
        });
    }
};

export default ActionManager;