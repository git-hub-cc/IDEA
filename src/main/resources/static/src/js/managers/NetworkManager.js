// src/js/managers/NetworkManager.js - 后端网络通信管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';

const NetworkManager = {
    // baseUrl 保持为空，我们将使用页面相对路径
    baseUrl: '',
    stompClient: null,
    isConnected: false,
    sessionId: null,
    terminalSubscription: null,

    init: function() {
        this.onBuildLogReceived = this.onBuildLogReceived.bind(this);
        this.onRunLogReceived = this.onRunLogReceived.bind(this);
        this.onDebugEventReceived = this.onDebugEventReceived.bind(this);
        this.onDiagnosticsReceived = this.onDiagnosticsReceived.bind(this);
        EventBus.on('app:ready', () => this.connectWebSocket());
    },

    connectWebSocket: function() {
        if (this.isConnected) return Promise.resolve();
        return new Promise((resolve, reject) => {
            // ==================== 关键修改点 1 START ====================
            // 原代码: const socket = new SockJS(this.baseUrl + '/ws');
            // 修改后: 去掉开头的 '/'，使其成为页面相对路径
            const socket = new SockJS(this.baseUrl + 'ws');
            // ==================== 关键修改点 1 END ======================

            this.stompClient = Stomp.over(socket);
            this.stompClient.debug = null;
            this.stompClient.connect({}, (frame) => {
                console.log('WebSocket 已连接: ' + frame);
                this.isConnected = true;
                const urlParts = socket._transport.url.split('/');
                this.sessionId = urlParts[urlParts.length - 2];
                console.log('WebSocket Session ID:', this.sessionId);
                this.subscribeToTopics();
                EventBus.emit('network:websocketConnected');
                resolve();
            }, (error) => {
                console.error('WebSocket 连接错误: ' + error);
                this.isConnected = false;
                this.sessionId = null;
                EventBus.emit('network:websocketDisconnected', error);
                reject(error);
            });
        });
    },

    subscribeToTopics: function() {
        if (!this.stompClient || !this.isConnected) return;
        // 这些是STOMP的目标地址，它们本身就是根相对的，不需要修改
        this.stompClient.subscribe('/topic/build-log', this.onBuildLogReceived);
        this.stompClient.subscribe('/topic/run-log', this.onRunLogReceived);
        this.stompClient.subscribe('/topic/debug-events', this.onDebugEventReceived);
        this.stompClient.subscribe('/topic/diagnostics', this.onDiagnosticsReceived);
        this.terminalSubscription = this.stompClient.subscribe(`/topic/terminal-output/${this.sessionId}`, (message) => {
            EventBus.emit('terminal:data', message.body);
        });
        EventBus.emit('log:info', '已成功订阅后端日志和调试事件。');
    },

    onBuildLogReceived: function(message) { EventBus.emit('console:log', '[构建] ' + message.body); },
    onRunLogReceived: function(message) { EventBus.emit('console:log', '[运行] ' + message.body); },
    onDebugEventReceived: function(message) {
        try { EventBus.emit('debugger:eventReceived', JSON.parse(message.body)); }
        catch (e) { EventBus.emit('log:error', '解析调试事件失败: ' + e.message); }
    },
    onDiagnosticsReceived: function(message) {
        try { EventBus.emit('diagnostics:updated', JSON.parse(message.body)); }
        catch (e) { EventBus.emit('log:error', '解析诊断信息失败: ' + e.message); }
    },

    fetchApi: async function(endpoint, options = {}) {
        const url = this.baseUrl + endpoint;
        try {
            const response = await fetch(url, {
                headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json', ...options.headers },
                ...options,
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API错误 ${response.status}: ${errorText || response.statusText}`);
            }
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) return response.json();
            return response.text();
        } catch (error) {
            EventBus.emit('log:error', `[网络错误] ${error.message}`);
            throw error;
        }
    },

    // ==================== 关键修改点 2 START ====================
    // --- API Methods (所有端点路径开头的 '/' 都被移除) ---
    getFileTree: (path = '') => NetworkManager.fetchApi(`api/files/tree?path=${encodeURIComponent(path)}`),
    getFileContent: (path) => NetworkManager.fetchApi(`api/files/content?path=${encodeURIComponent(path)}`),
    saveFileContent: (path, content) => NetworkManager.fetchApi('api/files/content', { method: 'POST', body: JSON.stringify({ path, content }) }),
    createFileOrDir: (parentPath, name, type) => NetworkManager.fetchApi('api/files/create', { method: 'POST', body: JSON.stringify({ parentPath, name, type }) }),
    deletePath: (path) => NetworkManager.fetchApi(`api/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
    renamePath: (oldPath, newName) => NetworkManager.fetchApi('api/files/rename', { method: 'PUT', body: JSON.stringify({ oldPath, newName }) }),
    buildProject: (projectPath) => NetworkManager.fetchApi(`api/java/build?projectPath=${encodeURIComponent(projectPath)}`, { method: 'POST' }),
    startDebug: (projectPath, mainClass) => NetworkManager.fetchApi(`api/debug/start?projectPath=${encodeURIComponent(projectPath)}&mainClass=${encodeURIComponent(mainClass)}`, { method: 'POST' }),
    stopDebug: () => NetworkManager.fetchApi('api/debug/stop', { method: 'POST' }),
    stepOver: () => NetworkManager.fetchApi('api/debug/stepOver', { method: 'POST' }),
    stepInto: () => NetworkManager.fetchApi('api/debug/stepInto', { method: 'POST' }),
    stepOut: () => NetworkManager.fetchApi('api/debug/stepOut', { method: 'POST' }),
    resumeDebug: () => NetworkManager.fetchApi('api/debug/resume', { method: 'POST' }),
    toggleBreakpoint: (breakpoint) => NetworkManager.fetchApi('api/debug/breakpoint/toggle', { method: 'POST', body: JSON.stringify(breakpoint) }),
    getCompletions: (filePath, line, character) => NetworkManager.fetchApi('api/language/completion', { method: 'POST', body: JSON.stringify({ filePath, line, character }) }),
    getGitStatus: () => NetworkManager.fetchApi('api/git/status'),
    gitCommit: (message) => NetworkManager.fetchApi('api/git/commit', { method: 'POST', body: JSON.stringify({ message }) }),
    gitPull: () => NetworkManager.fetchApi('api/git/pull', { method: 'POST' }),
    gitPush: () => NetworkManager.fetchApi('api/git/push', { method: 'POST' }),
    getSettings: () => NetworkManager.fetchApi('api/settings'),
    saveSettings: (settings) => NetworkManager.fetchApi('api/settings', { method: 'POST', body: JSON.stringify(settings) }),
    // STOMP 的 send 地址是绝对路径，不需要修改
    startTerminal: () => { if (NetworkManager.stompClient && NetworkManager.isConnected) NetworkManager.stompClient.send('/app/terminal/start'); },
    sendTerminalInput: (data) => { if (NetworkManager.stompClient && NetworkManager.isConnected) NetworkManager.stompClient.send('/app/terminal/input', {}, data); },
    // ==================== 关键修改点 2 END ======================

    uploadProject: function(directoryHandle) {
        return new Promise(async (resolve, reject) => {
            EventBus.emit('statusbar:updateStatus', '正在分析文件夹...');
            const filesToUpload = await this._getFilesRecursively(directoryHandle);
            if (filesToUpload.length === 0) {
                EventBus.emit('log:warn', "选择的文件夹为空。");
                return resolve();
            }

            const formData = new FormData();
            formData.append('projectPath', Config.CURRENT_PROJECT_PATH);
            filesToUpload.forEach(({ file, path }) => formData.append('files', file, path));

            const xhr = new XMLHttpRequest();
            // ==================== 关键修改点 3 START ====================
            // 同样，移除开头的 '/'
            xhr.open('POST', this.baseUrl + 'api/files/replace-project', true);
            // ==================== 关键修改点 3 END ======================

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    EventBus.emit('progress:update', { value: event.loaded, total: event.total, message: `上传中... ${Math.round((event.loaded / event.total) * 100)}%` });
                }
            };
            xhr.onloadstart = () => EventBus.emit('progress:start', { message: '开始上传...', total: 100 });
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    EventBus.emit('log:info', '项目上传完成。');
                    EventBus.emit('filesystem:changed');
                    resolve(xhr.responseText);
                } else {
                    const errorMsg = `上传失败: ${xhr.responseText}`;
                    EventBus.emit('log:error', `项目上传失败: ${xhr.status} ${errorMsg}`);
                    reject(new Error(errorMsg));
                }
            };
            xhr.onerror = () => {
                const errorMsg = '网络错误，无法上传项目。';
                EventBus.emit('log:error', '项目上传时发生网络错误。');
                reject(new Error(errorMsg));
            };
            xhr.onloadend = () => EventBus.emit('progress:finish');
            xhr.send(formData);
        });
    },

    _getFilesRecursively: async function(dirHandle, currentPath = '') {
        const files = [];
        for await (const entry of dirHandle.values()) {
            if (['.git', '.idea', 'node_modules', 'target', 'dist', 'build', '.DS_Store'].includes(entry.name)) continue;
            const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                files.push({ file, path: newPath });
            } else if (entry.kind === 'directory') {
                files.push(...await this._getFilesRecursively(entry, newPath));
            }
        }
        return files;
    },
};

export default NetworkManager;