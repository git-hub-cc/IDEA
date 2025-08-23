// src/js/managers/ActionManager.js - 应用全局动作管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from './NetworkManager.js';
import FileTreeManager from './FileTreeManager.js';
import CodeEditorManager from './CodeEditorManager.js';
import ModalManager from './ModalManager.js';
import RunManager from './RunManager.js';
import DebuggerManager from './DebuggerManager.js';
import TourManager from './TourManager.js';

/**
 * @description ActionManager 是一个中央分发器，它监听所有用户发起的动作事件
 * （如按钮点击、快捷键），并调用相应的管理器来执行具体的操作。
 */
const ActionManager = {
    /**
     * @description 初始化动作管理器，绑定所有应用级动作事件。
     */
    init: function() {
        this.bindAppEvents();
    },

    /**
     * @description 将所有 'action:' 和 'context-action:' 事件绑定到对应的处理函数。
     */
    bindAppEvents: function() {
        EventBus.on('action:new-file', ({ path } = {}) => this.handleNewFile(path));
        EventBus.on('action:open-folder', this.handleOpenFolder.bind(this));
        EventBus.on('action:save-file', this.handleSaveFile.bind(this));
        EventBus.on('action:format-code', this.handleFormatCode.bind(this));
        EventBus.on('action:find-in-file', () => EventBus.emit('editor:find'));
        EventBus.on('action:run-code', this.handleRunCode.bind(this));
        EventBus.on('action:stop-run', this.handleStopRun.bind(this));
        EventBus.on('action:debug-code', this.handleDebugCode.bind(this));
        EventBus.on('action:step-over', this.handleStepOver.bind(this));
        EventBus.on('action:step-into', this.handleStepInto.bind(this));
        EventBus.on('action:step-out', this.handleStepOut.bind(this));
        EventBus.on('action:resume-debug', this.handleResumeDebug.bind(this));
        EventBus.on('action:stop-debug', this.handleStopDebug.bind(this));
        EventBus.on('action:vcs-clone', this.handleVCSClone.bind(this));
        EventBus.on('action:clone-from-url', this.handleCloneFromUrl.bind(this));
        EventBus.on('action:vcs-commit', this.handleVCSCommit.bind(this));
        EventBus.on('action:vcs-pull', this.handleVCSPull.bind(this));
        EventBus.on('action:vcs-push', this.handleVCSPush.bind(this));
        EventBus.on('action:settings', this.handleSettings.bind(this));
        EventBus.on('action:start-tour', () => TourManager.start(true));
        EventBus.on('action:rename-active-file', this.handleRenameActiveFile.bind(this));

        // 上下文菜单动作
        EventBus.on('context-action:new-file', ({ path }) => this.handleNewFile(path, 'folder'));
        EventBus.on('context-action:new-folder', ({ path }) => this.handleNewFolder(path));
        EventBus.on('context-action:rename', ({ path, type }) => this.handleRenamePath(path, type));
        EventBus.on('context-action:delete', this.handleDeletePath.bind(this));
        EventBus.on('context-action:download', this.handleDownloadFile.bind(this));
        EventBus.on('context-action:open-in-terminal', this.handleOpenInTerminal.bind(this));
        EventBus.on('context-action:close-tab', this.handleCloseTab.bind(this));
        EventBus.on('context-action:close-other-tabs', this.handleCloseOtherTabs.bind(this));
        EventBus.on('context-action:close-tabs-to-the-right', this.handleCloseTabsToRight.bind(this));
        EventBus.on('context-action:close-tabs-to-the-left', this.handleCloseTabsToLeft.bind(this));
    },

    /**
     * @description 处理代码格式化请求。
     * - 如果是Java文件，则通过后端进行格式化。
     * - 否则，使用Monaco的内置格式化器。
     */
    handleFormatCode: async function() {
        if (!CodeEditorManager.monacoInstance) return;

        const activeLanguage = CodeEditorManager.getActiveLanguage();
        const model = CodeEditorManager.monacoInstance.getModel();
        if (!model) return;

        if (activeLanguage === 'java') {
            const originalCode = model.getValue();
            try {
                EventBus.emit('statusbar:updateStatus', '正在格式化Java代码...');
                const { formattedCode } = await NetworkManager.formatJavaCode(originalCode);

                // 使用pushEditOperations而不是setValue，以支持撤销(undo)操作
                const fullRange = model.getFullModelRange();
                const edit = { range: fullRange, text: formattedCode };
                model.pushEditOperations([], [edit], () => null);

                EventBus.emit('log:info', 'Java代码格式化成功。');
                EventBus.emit('statusbar:updateStatus', '格式化成功', 1500);
            } catch (error) {
                const errorMessage = error.message.includes('{')
                    ? JSON.parse(error.message.substring(error.message.indexOf('{'))).message
                    : error.message;
                EventBus.emit('log:error', `Java代码格式化失败: ${errorMessage}`);
                EventBus.emit('statusbar:updateStatus', '格式化失败', 2000);
            }
        } else {
            // 对于其他语言，触发Monaco的内置格式化动作
            EventBus.emit('editor:formatDocument');
            EventBus.emit('log:info', `正在为 ${activeLanguage} 文件执行内置格式化。`);
        }
    },


    /**
     * @description 获取用于创建新文件或文件夹的上下文路径。
     * @returns {string} 父目录的路径。
     * @private
     */
    _getCreationContextPath: function() {
        const focusedItem = FileTreeManager.getFocusedItem();
        if (!focusedItem) return '';
        if (focusedItem.type === 'folder') return focusedItem.path;
        const pathParts = focusedItem.path.split('/');
        pathParts.pop();
        return pathParts.join('/');
    },

    /**
     * @description 处理新建文件的动作。
     * @param {string} contextPath - 上下文路径。
     * @param {string} contextType - 上下文类型 ('file' 或 'folder')。
     */
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

    /**
     * @description 处理新建文件夹的动作。
     * @param {string} contextPath - 上下文路径。
     */
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

    /**
     * @description 处理从本地打开文件夹（项目）的动作。
     */
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

    /**
     * @description 处理重命名文件或文件夹的动作。
     * @param {string} path - 要重命名的路径。
     * @param {string} type - 路径类型 ('file' 或 'folder')。
     */
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

    /**
     * @description 处理保存文件的动作。
     */
    handleSaveFile: function() {
        EventBus.emit('file:saveRequest');
    },

    /**
     * 重写 `handleRunCode` 方法以支持动态主类选择。
     * 1. 检查运行状态。
     * 2. 获取主类列表。
     * 3. 根据主类数量决定下一步：
     *    - 0个：提示错误。
     *    - 1个：直接运行。
     *    - 多个：弹出选择框。
     * 4. 记住用户的选择。
     * 5. 调用后端API执行。
     */
    handleRunCode: async function() {
        if (RunManager.isPending) return; // 如果已在等待运行，则忽略点击
        if (RunManager.isRunning) {
            this.handleStopRun();
            return;
        }

        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。' });
            return;
        }

        try {
            EventBus.emit('statusbar:updateStatus', '正在扫描主类...');
            const mainClasses = await NetworkManager.getMainClasses(Config.currentProject);
            EventBus.emit('statusbar:updateStatus', '就绪');

            if (mainClasses.length === 0) {
                EventBus.emit('modal:showAlert', {
                    title: '无法运行',
                    message: '在项目中未找到任何可执行的主类 (public static void main)。'
                });
                return;
            }

            let selectedMainClass;
            if (mainClasses.length === 1) {
                selectedMainClass = mainClasses[0];
                EventBus.emit('log:info', `自动选择唯一的主类: ${selectedMainClass}`);
            } else {
                const storageKey = `lastRunMainClass_${Config.currentProject}`;
                const lastUsed = localStorage.getItem(storageKey);

                const choices = mainClasses.map(mc => ({
                    id: mc,
                    text: mc === lastUsed ? `${mc} (上次使用)` : mc
                }));

                selectedMainClass = await EventBus.emit('modal:showChoiceModal', {
                    title: '选择要运行的主类',
                    message: '项目中检测到多个可执行的主类。请选择一个运行:',
                    choices: choices
                })[0]; // EventBus.emit returns an array of results
            }

            if (selectedMainClass) {
                const storageKey = `lastRunMainClass_${Config.currentProject}`;
                localStorage.setItem(storageKey, selectedMainClass);
                await this._executeBuildAndRun(selectedMainClass);
            }
        } catch (error) {
            if (error.message !== '用户取消了操作。') {
                EventBus.emit('log:error', `运行程序失败: ${error.message}`);
                EventBus.emit('modal:showAlert', { title: '运行失败', message: '扫描或选择主类时出错。' });
            }
        }
    },

    /**
     * @description 封装实际的构建和运行API调用。
     * @param {string} mainClass - 要运行的主类。
     * @private
     */
    _executeBuildAndRun: async function(mainClass) {
        EventBus.emit('run:pending'); // 立即触发待定状态
        EventBus.emit('ui:activateBottomPanelTab', 'console-output');
        EventBus.emit('console:clear');
        EventBus.emit('statusbar:updateStatus', `正在构建 ${Config.activeProjectName}...`);

        try {
            await NetworkManager.buildProject(mainClass);
            EventBus.emit('log:info', '构建与运行请求已发送。');
        } catch (error) {
            EventBus.emit('log:error', `构建请求失败: ${error.message}`);
            let errorPayload = {};
            try {
                const jsonString = error.message.substring(error.message.indexOf('{'));
                errorPayload = JSON.parse(jsonString);
            } catch (e) {
                EventBus.emit('modal:showAlert', { title: '无法运行', message: '构建失败。请查看控制台日志。' });
                EventBus.emit('statusbar:updateStatus', '构建失败', 2000);
                return;
            }

            if (errorPayload.type === 'ENVIRONMENT_ERROR') {
                EventBus.emit('modal:showConfirm', {
                    title: '环境配置错误',
                    message: errorPayload.message || '执行环境未正确配置，无法运行项目。',
                    confirmText: '前往设置',
                    cancelText: '关闭',
                    onConfirm: () => {
                        this.handleSettings('env-settings-pane');
                    }
                });
            } else {
                EventBus.emit('modal:showAlert', { title: '无法运行', message: errorPayload.message || '未知构建错误' });
            }
            EventBus.emit('statusbar:updateStatus', '构建失败', 2000);
        }
    },

    /**
     * @description 处理停止正在运行的程序的动作。
     */
    handleStopRun: async function() {
        if (RunManager.isProgramRunning()) {
            EventBus.emit('statusbar:updateStatus', '正在停止程序...');
            try {
                await NetworkManager.stopRun();
                EventBus.emit('log:info', '停止信号已发送。');
            } catch (error) {
                EventBus.emit('log:error', `发送停止信号失败: ${error.message}`);
                EventBus.emit('modal:showAlert', { title: '错误', message: '无法停止程序，请稍后再试。' });
                EventBus.emit('statusbar:updateStatus', '停止失败', 2000);
            }
        }
    },

    /** @description 停止调试会话 */
    handleStopDebug: function() { NetworkManager.stopDebug(); },
    /** @description 调试：步过 */
    handleStepOver: function() { NetworkManager.stepOver(); },
    /** @description 调试：步入 */
    handleStepInto: function() { NetworkManager.stepInto(); },
    /** @description 调试：步出 */
    handleStepOut: function() { NetworkManager.stepOut(); },
    /** @description 调试：恢复程序 */
    handleResumeDebug: function() { NetworkManager.resumeDebug(); },

    /**
     * @description 启动调试会话，逻辑与运行类似，先扫描并选择主类。
     */
    handleDebugCode: async function() {
        if (DebuggerManager.isDebugging) {
            this.handleStopDebug();
            return;
        }

        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。' });
            return;
        }
        if (DebuggerManager.isPending) return; // 如果已在等待调试，则忽略
        if (DebuggerManager.isDebugging || RunManager.isProgramRunning()) {
            EventBus.emit('modal:showAlert', { title: '操作冲突', message: '已有程序在运行或调试中。请先停止当前会话。' });
            return;
        }

        try {
            EventBus.emit('statusbar:updateStatus', '正在扫描主类...');
            const mainClasses = await NetworkManager.getMainClasses(Config.currentProject);
            EventBus.emit('statusbar:updateStatus', '就绪');

            if (mainClasses.length === 0) {
                EventBus.emit('modal:showAlert', {
                    title: '无法调试',
                    message: '在项目中未找到任何可执行的主类 (public static void main)。'
                });
                return;
            }

            let selectedMainClass;
            if (mainClasses.length === 1) {
                selectedMainClass = mainClasses[0];
                EventBus.emit('log:info', `自动选择唯一的主类进行调试: ${selectedMainClass}`);
            } else {
                const storageKey = `lastDebugMainClass_${Config.currentProject}`;
                const lastUsed = localStorage.getItem(storageKey);

                const choices = mainClasses.map(mc => ({
                    id: mc,
                    text: mc === lastUsed ? `${mc} (上次使用)` : mc
                }));

                selectedMainClass = await EventBus.emit('modal:showChoiceModal', {
                    title: '选择要调试的主类',
                    message: '项目中检测到多个可执行的主类。请选择一个进行调试:',
                    choices: choices
                })[0];
            }

            if (selectedMainClass) {
                const storageKey = `lastDebugMainClass_${Config.currentProject}`;
                localStorage.setItem(storageKey, selectedMainClass);
                await this._executeDebug(selectedMainClass);
            }
        } catch (error) {
            if (error.message !== '用户取消了操作。') {
                EventBus.emit('log:error', `启动调试失败: ${error.message}`);
                EventBus.emit('modal:showAlert', { title: '调试失败', message: '扫描或选择主类时出错。' });
            }
        }
    },

    /**
     * @description 封装实际的调试API调用。
     * @param {string} mainClass - 要调试的主类。
     * @private
     */
    _executeDebug: async function(mainClass) {
        EventBus.emit('debug:pending'); // 立即触发待定状态
        EventBus.emit('ui:activateBottomPanelTab', 'debugger-panel');
        EventBus.emit('debugger:clear');
        EventBus.emit('console:clear');
        EventBus.emit('statusbar:updateStatus', '启动调试器...');
        try {
            await NetworkManager.startDebug(mainClass);
            EventBus.emit('log:info', '调试会话启动请求已发送。');
        } catch (error) {
            EventBus.emit('log:error', `启动调试失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '调试失败', message: error.message });
            EventBus.emit('statusbar:updateStatus', '调试失败', 2000);
        }
    },

    /**
     * @description 处理从Git平台克隆仓库的动作。
     */
    handleVCSClone: async function() {
        EventBus.emit('statusbar:updateStatus', '正在获取远程仓库列表...');
        try {
            const repos = await NetworkManager.getRemoteRepos();
            EventBus.emit('statusbar:updateStatus', '就绪');
            if (repos.length === 0) {
                EventBus.emit('modal:showAlert', { title: '无仓库', message: '在所选平台上找不到任何公开仓库，或令牌无效/限流。' });
                return;
            }
            const selectedCloneUrl = await ModalManager.showRepoSelectionModal(repos);
            await this._cloneRepository(selectedCloneUrl);
        } catch (error) {
            if (error.message !== '用户取消了操作。') {
                EventBus.emit('log:error', `获取或克隆仓库失败: ${error.message}`);
                EventBus.emit('modal:showAlert', { title: 'API错误', message: '无法连接到Git平台或克隆失败。请检查设置中的令牌是否正确。' });
                EventBus.emit('statusbar:updateStatus', '获取仓库失败', 3000);
            }
        }
    },

    /**
     * @description 处理从URL克隆仓库的动作。
     */
    handleCloneFromUrl: async function() {
        EventBus.emit('modal:showPrompt', {
            title: '从 URL 克隆',
            message: '请输入 Git 仓库的 HTTPS URL:',
            defaultValue: 'https://',
            onConfirm: async (repoUrl) => {
                if (!repoUrl || !repoUrl.startsWith('https://')) {
                    EventBus.emit('modal:showAlert', { title: '无效的 URL', message: '请输入一个有效的 HTTPS Git URL。' });
                    return;
                }
                await this._cloneRepository(repoUrl);
            }
        });
    },

    /**
     * @description 执行克隆仓库的通用逻辑。
     * @param {string} cloneUrl - 要克隆的仓库URL。
     * @private
     */
    _cloneRepository: async function(cloneUrl) {
        if (!cloneUrl) return;
        EventBus.emit('statusbar:updateStatus', '正在克隆选择的仓库...', 0);
        EventBus.emit('progress:start', { message: '正在克隆...' });
        try {
            const response = await NetworkManager.cloneSpecificRepo(cloneUrl);
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

    /**
     * @description 处理Git提交的动作。
     */
    handleVCSCommit: function() {
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。' });
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

    /**
     * @description 处理Git拉取的动作。
     */
    handleVCSPull: async function() {
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。' });
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

    /**
     * @description 处理Git推送的动作。
     */
    handleVCSPush: async function() {
        if (!Config.currentProject) {
            EventBus.emit('modal:showAlert', { title: '无活动项目', message: '请先克隆或打开一个项目。' });
            return;
        }
        EventBus.emit('statusbar:updateStatus', '正在推送...');
        try {
            const result = await NetworkManager.gitPush();
            EventBus.emit('log:info', `推送操作: ${result.message}`);
            EventBus.emit('statusbar:updateStatus', '推送成功!', 2000);
            EventBus.emit('modal:showConfirm', {
                title: 'Git 推送成功',
                message: '代码已成功推送到远程仓库。是否在新标签页中打开仓库页面？',
                confirmText: '打开仓库',
                cancelText: '关闭',
                onConfirm: () => {
                    if (result.repoUrl) {
                        window.open(result.repoUrl, '_blank');
                    }
                }
            });
        } catch (error) {
            let displayMessage = error.message;
            try {
                const jsonString = displayMessage.substring(displayMessage.indexOf('{'));
                const errorPayload = JSON.parse(jsonString);
                if (errorPayload && errorPayload.message) displayMessage = errorPayload.message;
            } catch (e) { /* 不是JSON错误，直接使用 */ }
            EventBus.emit('log:error', `推送失败: ${displayMessage}`);
            EventBus.emit('modal:showAlert', { title: 'Git 推送失败', message: displayMessage });
            EventBus.emit('statusbar:updateStatus', '推送失败', 2000);
        }
    },

    /**
     * @description 处理打开设置的动作。
     * @param {string} [defaultTab='app-settings-pane'] - 默认打开的设置标签页ID。
     */
    handleSettings: async function(defaultTab = 'app-settings-pane') {
        try {
            const currentSettings = await NetworkManager.getSettings();
            EventBus.emit('modal:showSettings', currentSettings, defaultTab);
        } catch (error) {
            EventBus.emit('log:error', `加载设置失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '错误', message: '无法加载设置。' });
        }
    },

    /**
     * @description 处理删除文件或文件夹的动作。
     * @param {object} payload - 动作的载荷。
     * @param {string} payload.path - 要删除的路径。
     * @param {string} payload.type - 路径类型 ('file' 或 'folder')。
     */
    handleDeletePath: function({ path, type }) {
        const isProjectRoot = type === 'folder' && (path === '' || !path.includes('/'));
        const pathToDelete = isProjectRoot ? Config.currentProject : path;

        if (!pathToDelete) {
            EventBus.emit('log:error', '无法确定要删除的路径。');
            return;
        }

        const title = isProjectRoot ? '确认删除项目' : '确认删除';
        const message = isProjectRoot
            ? `您确定要永久删除整个项目 '${pathToDelete}' 吗？此操作不可撤销，所有文件都将丢失。`
            : `您确定要删除 '${pathToDelete}' 吗？此操作不可撤销。`;

        EventBus.emit('modal:showConfirm', {
            title: title,
            message: message,
            onConfirm: async () => {
                try {
                    if (isProjectRoot) {
                        await NetworkManager.deleteProject(pathToDelete);
                        EventBus.emit('log:info', `项目 '${pathToDelete}' 已被删除。`);

                        // 重新获取项目列表并更新UI
                        const projects = await NetworkManager.getProjects();
                        Config.setProjectList(projects);

                        // 如果删除的是当前项目，则需要更新全局状态
                        if (Config.currentProject === pathToDelete) {
                            Config.setActiveProject(null);
                        }
                    } else {
                        await NetworkManager.deletePath(pathToDelete);
                        EventBus.emit('log:info', `路径 '${pathToDelete}' 已被删除。`);
                        EventBus.emit('filesystem:changed');
                        EventBus.emit('file:closeRequest', pathToDelete);
                    }
                } catch (error) {
                    EventBus.emit('log:error', `删除失败: ${error.message}`);
                    EventBus.emit('modal:showAlert', { title: '删除失败', message: error.message });
                }
            }
        });
    },

    /**
     * @description 处理下载文件的动作。
     * @param {object} payload - 动作的载荷。
     * @param {string} payload.path - 要下载的文件路径。
     */
    handleDownloadFile: async function({ path }) {
        const filename = path.split('/').pop();
        EventBus.emit('statusbar:updateStatus', `正在下载 ${filename}...`);
        try {
            const blob = await NetworkManager.downloadFileAsBlob(path);
            this._downloadBlob(blob, filename);
            EventBus.emit('log:info', `文件 '${filename}' 已开始下载。`);
            EventBus.emit('statusbar:updateStatus', '下载成功', 2000);
        } catch (error) {
            EventBus.emit('log:error', `下载文件 ${filename} 失败: ${error.message}`);
            EventBus.emit('modal:showAlert', { title: '下载失败', message: error.message });
            EventBus.emit('statusbar:updateStatus', '下载失败', 3000);
        }
    },

    /**
     * @description 创建一个链接并模拟点击来触发浏览器下载。
     * @param {Blob} blob - 要下载的Blob对象。
     * @param {string} filename - 下载时使用的文件名。
     * @private
     */
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

    /** @description 关闭标签页 */
    handleCloseTab: function({ filePath }) { EventBus.emit('file:closeRequest', filePath); },
    /** @description 关闭其他标签页 */
    handleCloseOtherTabs: function({ filePath }) { EventBus.emit('editor:closeOtherTabs', filePath); },
    /** @description 关闭右侧标签页 */
    handleCloseTabsToRight: function({ filePath }) { EventBus.emit('editor:closeTabsToTheRight', filePath); },
    /** @description 关闭左侧标签页 */
    handleCloseTabsToLeft: function({ filePath }) { EventBus.emit('editor:closeTabsToTheLeft', filePath); },

    /**
     * @description 处理重命名当前活动文件的动作。
     */
    handleRenameActiveFile: function() {
        const activePath = CodeEditorManager.activeFilePath;
        if (activePath) {
            this.handleRenamePath(activePath, 'file');
        } else {
            EventBus.emit('modal:showAlert', { title: '操作无效', message: '请先打开一个文件。' });
        }
    },

    /**
     * @description 处理在终端中打开文件夹的动作。
     * @param {object} payload - 动作载荷。
     * @param {string} payload.path - 路径。
     * @param {string} payload.type - 路径类型 ('file' 或 'folder')。
     */
    handleOpenInTerminal: function({ path, type }) {
        if (!Config.currentProject) return;
        let folderPathInProject = path;
        if (type === 'file') {
            const lastSlash = path.lastIndexOf('/');
            folderPathInProject = lastSlash > -1 ? path.substring(0, lastSlash) : '';
        }
        const fullPath = folderPathInProject ?
            `${Config.currentProject}/${folderPathInProject}` :
            Config.currentProject;
        EventBus.emit('ui:activateBottomPanelTab', 'terminal-panel');
        NetworkManager.startTerminal(fullPath);
    },
};

export default ActionManager;