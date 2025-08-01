// src/js/managers/NetworkManager.js - 结合了相对路径和自动项目注入的最佳版本

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';

const NetworkManager = {
    // 使用空字符串，让所有请求都成为页面相对路径
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
            // 'ws' 将被浏览器自动解析为相对于当前页面的路径
            const socket = new SockJS(this.baseUrl + 'ws');
            this.stompClient = Stomp.over(socket);
            this.stompClient.debug = null;
            this.stompClient.connect({}, (frame) => {
                console.log('WebSocket 已连接: ' + frame);
                this.isConnected = true;
                const urlParts = socket._transport.url.split('/');
                this.sessionId = urlParts[urlParts.length - 2];
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
        try {
            const data = JSON.parse(message.body);
            EventBus.emit('diagnostics:updated', data);
        }
        catch (e) { EventBus.emit('log:error', '解析诊断信息失败: ' + e.message); }
    },

    _rawFetchApi: async function(endpoint, options = {}) {
        // endpoint 是相对路径, e.g., 'api/projects'
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

    // 这个 fetchApi 包装器是关键，它会自动处理 projectPath
    fetchApi: async function(endpoint, options = {}) {
        let finalEndpoint = endpoint;
        let finalOptions = { ...options };

        if (Config.currentProject) {
            const method = (finalOptions.method || 'GET').toUpperCase();
            let injectedInBody = false;

            // 尝试将 projectPath 注入到 POST/PUT 请求的 JSON 体中
            if (['POST', 'PUT'].includes(method) && finalOptions.body && typeof finalOptions.body === 'string') {
                try {
                    const bodyData = JSON.parse(finalOptions.body);
                    if (typeof bodyData === 'object' && bodyData !== null && !('projectPath' in bodyData)) {
                        bodyData.projectPath = Config.currentProject;
                        finalOptions.body = JSON.stringify(bodyData);
                    }
                    injectedInBody = true;
                } catch (e) {
                    injectedInBody = false;
                }
            }

            // 如果没注入到 body，则作为 URL 参数添加
            if (!injectedInBody) {
                // 使用一个临时的、无意义的基础URL来操作URLSearchParams
                const tempBase = 'http://localhost/';
                const url = new URL(finalEndpoint, tempBase);
                if (!url.searchParams.has('projectPath')) {
                    url.searchParams.append('projectPath', Config.currentProject);
                }
                finalEndpoint = url.pathname.substring(1) + url.search;
            }
        }
        return this._rawFetchApi(finalEndpoint, finalOptions);
    },

    // --- API Methods (这些方法现在可以无缝工作) ---
    getProjects: () => NetworkManager.fetchApi('api/projects'),

    getFileTree: (relativePath = '') => {
        if (!Config.currentProject) return Promise.resolve(null);
        return NetworkManager.fetchApi(`api/files/tree?path=${encodeURIComponent(relativePath)}`);
    },
    getFileContent: (relativePath) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi(`api/files/content?path=${encodeURIComponent(relativePath)}`);
    },
    saveFileContent: (relativePath, content) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi('api/files/content', { method: 'POST', body: JSON.stringify({ path: relativePath, content }) });
    },
    buildProject: () => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi(`api/java/build`, { method: 'POST' });
    },
    startDebug: (mainClass) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi(`api/debug/start?mainClass=${encodeURIComponent(mainClass)}`, { method: 'POST' });
    },
    getGitStatus: () => {
        if (!Config.currentProject) return Promise.resolve({ currentBranch: 'N/A', counts: {} });
        return NetworkManager.fetchApi(`api/git/status`);
    },
    gitCommit: (message) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi('api/git/commit', { method: 'POST', body: JSON.stringify({ message }) });
    },
    gitPull: () => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi(`api/git/pull`, { method: 'POST' });
    },
    gitPush: () => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi(`api/git/push`, { method: 'POST' });
    },
    createFileOrDir: (parentPath, name, type) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi('api/files/create', { method: 'POST', body: JSON.stringify({ parentPath, name, type }) });
    },
    deletePath: (path) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi(`api/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    },
    renamePath: (oldPath, newName) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi('api/files/rename', { method: 'PUT', body: JSON.stringify({ oldPath, newName }) });
    },
    getCompletions: (filePath, line, character) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi('api/language/completion', {
            method: 'POST',
            body: JSON.stringify({ filePath, line, character })
        });
    },
    toggleBreakpoint: (breakpoint) => {
        if (!Config.currentProject) return Promise.reject(new Error("No active project."));
        return NetworkManager.fetchApi('api/debug/breakpoint/toggle', { method: 'POST', body: JSON.stringify(breakpoint) });
    },
    getGiteeRepos: () => NetworkManager.fetchApi('api/git/gitee-repos'),
    cloneSpecificRepo: (sshUrl) => NetworkManager.fetchApi('api/git/clone-specific', {
        method: 'POST',
        body: JSON.stringify({ sshUrl })
    }),
    stopDebug: () => NetworkManager.fetchApi('api/debug/stop', { method: 'POST' }),
    stepOver: () => NetworkManager.fetchApi('api/debug/stepOver', { method: 'POST' }),
    stepInto: () => NetworkManager.fetchApi('api/debug/stepInto', { method: 'POST' }),
    stepOut: () => NetworkManager.fetchApi('api/debug/stepOut', { method: 'POST' }),
    resumeDebug: () => NetworkManager.fetchApi('api/debug/resume', { method: 'POST' }),
    getSettings: () => NetworkManager.fetchApi('api/settings'),
    saveSettings: (settings) => NetworkManager.fetchApi('api/settings', { method: 'POST', body: JSON.stringify(settings) }),
    startTerminal: () => {
        if (NetworkManager.stompClient && NetworkManager.isConnected) {
            NetworkManager.stompClient.send('/app/terminal/start', {}, Config.currentProject || "");
        }
    },
    sendTerminalInput: (data) => { if (NetworkManager.stompClient && NetworkManager.isConnected) NetworkManager.stompClient.send('/app/terminal/input', {}, data); },

    uploadProject: function(directoryHandle, projectName) {
        return new Promise(async (resolve, reject) => {
            EventBus.emit('statusbar:updateStatus', '正在分析文件夹...');
            const filesToUpload = await this._getFilesRecursively(directoryHandle);
            if (filesToUpload.length === 0) {
                EventBus.emit('log:warn', "选择的文件夹为空。");
                return resolve();
            }

            const formData = new FormData();
            formData.append('projectPath', projectName);
            filesToUpload.forEach(({ file, path }) => formData.append('files', file, path));

            const xhr = new XMLHttpRequest();
            // 使用相对路径 'api/files/replace-project'
            xhr.open('POST', this.baseUrl + 'api/files/replace-project', true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    EventBus.emit('progress:update', { value: event.loaded, total: event.total, message: `上传中... ${Math.round((event.loaded / event.total) * 100)}%` });
                }
            };
            xhr.onloadstart = () => EventBus.emit('progress:start', { message: '开始上传...', total: 100 });
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    EventBus.emit('log:info', '项目上传完成。');
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