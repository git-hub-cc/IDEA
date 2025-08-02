// src/js/managers/ActionManager.js

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from './NetworkManager.js';
import FileTreeManager from './FileTreeManager.js';
import CodeEditorManager from './CodeEditorManager.js';
import ModalManager from './ModalManager.js';

const ActionManager = {
    init: function() {
        this.bindAppEvents();
    },

    bindAppEvents: function() {
        EventBus.on('action:new-file', ({ path } = {}) => this.handleNewFile(path));
        EventBus.on('action:open-folder', this.handleOpenFolder.bind(this));
        EventBus.on('action:save-file', this.handleSaveFile.bind(this));
        EventBus.on('action:format-code', () => EventBus.emit('editor:formatDocument'));
        EventBus.on('action:find-in-file', () => EventBus.emit('editor:find'));
        EventBus.on('action:run-code', this.handleRunCode.bind(this));
        EventBus.on('action:debug-code', this.handleDebugCode.bind(this));
        EventBus.on('action:step-over', NetworkManager.stepOver);
        EventBus.on('action:step-into', NetworkManager.stepInto);
        EventBus.on('action:step-out', NetworkManager.stepOut);
        EventBus.on('action:resume-debug', NetworkManager.resumeDebug);
        EventBus.on('action:stop-debug', NetworkManager.stopDebug);
        EventBus.on('action:vcs-clone', this.handleVCSClone.bind(this));
        EventBus.on('action:clone-from-url', this.handleCloneFromUrl.bind(this));
        EventBus.on('action:vcs-commit', this.handleVCSCommit.bind(this));
        EventBus.on('action:vcs-pull', this.handleVCSPull.bind(this));
        EventBus.on('action:vcs-push', this.handleVCSPush.bind(this));
        EventBus.on('action:settings', this.handleSettings.bind(this));
        EventBus.on('action:about', this.handleAbout.bind(this));

        // 文件树上下文菜单 & 快捷键动作
        EventBus.on('action:rename-active-file', this.handleRenameActiveFile.bind(this));
        EventBus.on('context-action:new-file', ({ path }) => this.handleNewFile(path, 'folder'));
        EventBus.on('context-action:new-folder', ({ path }) => this.handleNewFolder(path));
        EventBus.on('context-action:rename', ({ path, type }) => this.handleRenamePath(path, type));
        EventBus.on('context-action:delete', this.handleDeletePath.bind(this));
        EventBus.on('context-action:download', this.handleDownloadFile.bind(this));

        // 编辑器标签页上下文菜单动作
        EventBus.on('context-action:close-tab', this.handleCloseTab.bind(this));
        EventBus.on('context-action:close-other-tabs', this.handleCloseOtherTabs.bind(this));
        EventBus.on('context-action:close-tabs-to-the-right', this.handleCloseTabsToRight.bind(this));
        EventBus.on('context-action:close-tabs-to-the-left', this.handleCloseTabsToLeft.bind(this));
    },

    _getCreationContextPath: function() {
        const focusedItem = FileTreeManager.getFocusedItem();
        if (!focusedItem) return '';
        if (focusedItem.type === 'folder') return focusedItem.path;
        const pathParts = focusedItem.path.split('/');
        pathParts.pop();
        return pathParts.join('/');
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
            EventBus.emit('modal:showAlert', { title: '浏览器不支持', message: '您的浏览器不支持文件夹选择功能。' });
            return;
        }

        EventBus.emit('modal:showConfirm', {
            title: '打开新项目',
            message: '这将替换工作区中的同名项目（如果存在）。您确定要继续吗？',
            onConfirm: async () => {
                try {
                    const directoryHandle = await window.showDirectoryPicker();
                    const projectName = directoryHandle.name;

                    await NetworkManager.uploadProject(directoryHandle, projectName);

                    Config.setActiveProject(projectName);

                    EventBus.emit('modal:showAlert', { title: '成功', message: `项目 '${projectName}' 已成功加载！` });
                    EventBus.emit('filesystem:changed');
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        EventBus.emit('log:error', `打开文件夹失败: ${error.message}`);
                        EventBus.emit('modal:showAlert', { title: '打开失败', message: `无法加载项目: ${error.message}` });
                    }
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
                    const newPath = path.substring(0, path.lastIndexOf('/') + 1) + newName;
                    EventBus.emit('file:renameRequest', { oldPath: path, newPath: newPath });
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
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。'});
            return;
        }

        EventBus.emit('ui:activateBottomPanelTab', 'console-output');
        EventBus.emit('console:clear');
        EventBus.emit('statusbar:updateStatus', `正在构建 ${Config.activeProjectName}...`);

        try {
            await NetworkManager.buildProject();
            EventBus.emit('log:info', '构建与运行请求已发送。');
        } catch (error) {
            EventBus.emit('log:error', `构建请求失败: ${error.message}`);
            EventBus.emit('statusbar:updateStatus', '构建失败', 2000);
        }
    },

    handleDebugCode: async function() {
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。'});
            return;
        }
        const mainClass = 'com.example.Main'; // 应当从项目配置读取
        EventBus.emit('ui:activateBottomPanelTab', 'debugger-panel');
        EventBus.emit('debugger:clear');
        EventBus.emit('console:clear');
        EventBus.emit('statusbar:updateStatus', '启动调试器...');
        try {
            await NetworkManager.startDebug(mainClass);
            EventBus.emit('log:info', '调试会话启动请求已发送。');
        } catch (error) {
            EventBus.emit('log:error', `启动调试失败: ${error.message}`);
            EventBus.emit('statusbar:updateStatus', '调试失败', 2000);
        }
    },

    handleVCSClone: async function() {
        EventBus.emit('statusbar:updateStatus', '正在从Gitee获取仓库列表...');
        let repos;
        try {
            repos = await NetworkManager.getGiteeRepos();
            EventBus.emit('statusbar:updateStatus', '就绪');
        } catch (error) {
            EventBus.emit('log:error', `获取Gitee仓库列表失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: 'API错误', message: '无法连接到Gitee获取仓库列表。' });
            EventBus.emit('statusbar:updateStatus', '获取仓库失败', 3000);
            return;
        }

        if (repos.length === 0) {
            EventBus.emit('modal:showAlert', { title: '无仓库', message: '在Gitee上找不到任何公开仓库，或令牌无效/限流。' });
            return;
        }

        try {
            const selectedCloneUrl = await ModalManager.showRepoSelectionModal(repos);

            EventBus.emit('statusbar:updateStatus', '正在克隆选择的仓库...', 0);
            EventBus.emit('progress:start', { message: '正在克隆...' });

            try {
                const response = await NetworkManager.cloneSpecificRepo(selectedCloneUrl);
                const newProjectName = response.projectName;

                const updatedProjects = await NetworkManager.getProjects();
                Config.setProjectList(updatedProjects);
                Config.setActiveProject(newProjectName);

                EventBus.emit('log:info', `项目 '${newProjectName}' 克隆成功!`);
                EventBus.emit('statusbar:updateStatus', '克隆成功!', 3000);
                EventBus.emit('filesystem:changed');
            } catch (cloneError) {
                EventBus.emit('log:error', `克隆失败: ${cloneError.message}`);
                EventBus.emit('modal:showAlert', { title: '克隆失败', message: cloneError.message });
                EventBus.emit('statusbar:updateStatus', '克隆失败', 3000);
            } finally {
                EventBus.emit('progress:finish');
            }

        } catch (error) {
            if (error.message === '用户取消了操作。') {
                EventBus.emit('log:info', '用户取消了仓库选择。');
            } else {
                EventBus.emit('log:error', `显示仓库选择时出错: ${error.message}`);
            }
        }
    },

    handleCloneFromUrl: async function() {
        EventBus.emit('modal:showPrompt', {
            title: '从 URL 克隆',
            message: '请输入 Git 仓库的 HTTPS URL:',
            defaultValue: 'https://gitee.com/',
            onConfirm: async (repoUrl) => {
                if (!repoUrl || !repoUrl.startsWith('https://')) {
                    EventBus.emit('modal:showAlert', { title: '无效的 URL', message: '请输入一个有效的 HTTPS Git URL。' });
                    return;
                }

                EventBus.emit('statusbar:updateStatus', '正在克隆仓库...', 0);
                EventBus.emit('progress:start', { message: '正在克隆...' });

                try {
                    const response = await NetworkManager.cloneSpecificRepo(repoUrl);
                    const newProjectName = response.projectName;

                    const updatedProjects = await NetworkManager.getProjects();
                    Config.setProjectList(updatedProjects);
                    Config.setActiveProject(newProjectName);

                    EventBus.emit('log:info', `项目 '${newProjectName}' 克隆成功!`);
                    EventBus.emit('statusbar:updateStatus', '克隆成功!', 3000);
                    EventBus.emit('filesystem:changed');
                } catch (cloneError) {
                    EventBus.emit('log:error', `克隆失败: ${cloneError.message}`);
                    EventBus.emit('modal:showAlert', { title: '克隆失败', message: cloneError.message });
                    EventBus.emit('statusbar:updateStatus', '克隆失败', 3000);
                } finally {
                    EventBus.emit('progress:finish');
                }
            },
            onCancel: () => {
                EventBus.emit('log:info', '用户取消了从 URL 克隆操作。');
            }
        });
    },

    handleVCSCommit: function() {
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。'});
            return;
        }
        EventBus.emit('modal:showPrompt', {
            title: 'Git 提交',
            message: '请输入提交信息:',
            onConfirm: async (message) => {
                if (!message) return;
                EventBus.emit('statusbar:updateStatus', '正在提交...');
                try {
                    await NetworkManager.gitCommit(message);
                    EventBus.emit('log:info', '提交成功!');
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
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。'});
            return;
        }
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
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。'});
            return;
        }
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
            message: '这是一个基于Vanilla JS和ES6模块构建的IDE原型。\n版本: 2.8.0-pom-jdk'
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
    },

    handleDownloadFile: async function({ path }) {
        const filename = path.split('/').pop();
        EventBus.emit('statusbar:updateStatus', `正在下载 ${filename}...`);
        try {
            const blob = await NetworkManager.downloadFileAsBlob(path);
            this._downloadBlob(blob, filename);
            EventBus.emit('log:info', `文件 '${filename}' 已开始下载。`);
            EventBus.emit('statusbar:updateStatus', '下载成功', 2000);
        } catch(error) {
            EventBus.emit('log:error', `下载文件 ${filename} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '下载失败', message: error.message });
            EventBus.emit('statusbar:updateStatus', '下载失败', 3000);
        }
    },

    _downloadBlob: function(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    },

    handleCloseTab: function({ filePath }) {
        EventBus.emit('file:closeRequest', filePath);
    },

    handleCloseOtherTabs: function({ filePath }) {
        EventBus.emit('editor:closeOtherTabs', filePath);
    },

    handleCloseTabsToRight: function({ filePath }) {
        EventBus.emit('editor:closeTabsToTheRight', filePath);
    },

    handleCloseTabsToLeft: function({ filePath }) {
        EventBus.emit('editor:closeTabsToTheLeft', filePath);
    },

    /**
     * @description 处理通过快捷键 (Shift+F6) 触发的重命名活动文件操作
     */
    handleRenameActiveFile: function() {
        const activePath = CodeEditorManager.activeFilePath;
        if (activePath) {
            // 复用现有的重命名路径逻辑
            this.handleRenamePath(activePath, 'file');
        } else {
            EventBus.emit('log:warn', '没有激活的文件可以重命名。');
            EventBus.emit('modal:showAlert', { title: '操作无效', message: '请先打开一个文件。' });
        }
    },
};
export default ActionManager;