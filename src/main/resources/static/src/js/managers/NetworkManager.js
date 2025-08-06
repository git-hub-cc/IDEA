// src/js/managers/NetworkManager.js

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';

const NetworkManager = {
    baseUrl: '',
    stompClient: null,
    isConnected: false,
    sessionId: null,

    init: function() {
        this.onBuildLogReceived = this.onBuildLogReceived.bind(this);
        this.onRunLogReceived = this.onRunLogReceived.bind(this);
        this.onDebugEventReceived = this.onDebugEventReceived.bind(this);
        this.onRunStatusReceived = this.onRunStatusReceived.bind(this);
        this.onSessionStatusReceived = this.onSessionStatusReceived.bind(this);
        EventBus.on('app:ready', () => this.connectWebSocket());
    },

    connectWebSocket: function() {
        if (this.isConnected) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const socket = new SockJS(this.baseUrl + 'ws');
            this.stompClient = Stomp.over(socket);
            this.stompClient.debug = null;

            this.stompClient.heartbeat.outgoing = 10000;
            this.stompClient.heartbeat.incoming = 10000;

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

                setTimeout(() => {
                    console.log("尝试重新连接 WebSocket...");
                    // 注意：这里不直接调用 connectWebSocket，因为如果应用被锁定，应该由 SessionLockManager 控制
                    // EventBus.emit('session:check');
                }, 5000);

                reject(error);
            });
        });
    },

    subscribeToTopics: function() {
        if (!this.stompClient || !this.isConnected) return;
        this.stompClient.subscribe('/topic/build-log', this.onBuildLogReceived);
        this.stompClient.subscribe('/topic/run-log', this.onRunLogReceived);
        this.stompClient.subscribe('/topic/debug-events', this.onDebugEventReceived);
        this.stompClient.subscribe('/topic/run/status', this.onRunStatusReceived);
        this.stompClient.subscribe(`/topic/terminal-output/${this.sessionId}`, (message) => {
            EventBus.emit('terminal:data', message.body);
        });
        // 订阅用户特定的会话状态主题
        this.stompClient.subscribe('/user/queue/session/status', this.onSessionStatusReceived);
        EventBus.emit('log:info', '已成功订阅后端日志、调试和运行状态事件。');
    },

    onBuildLogReceived: function(message) {
        EventBus.emit('console:log', '[构建]\n' + message.body);
    },
    onRunLogReceived: function(message) {
        EventBus.emit('console:log', message.body);
    },
    onDebugEventReceived: function(message) {
        try { EventBus.emit('debugger:eventReceived', JSON.parse(message.body)); }
        catch (e) { EventBus.emit('log:error', '解析调试事件失败: ' + e.message); }
    },
    onRunStatusReceived: function(message) {
        EventBus.emit('run:statusChanged', message.body);
    },
    onSessionStatusReceived: function(message) {
        if (message.body === 'LOCKED') {
            // ========================= 关键修改 START =========================
            // 当收到“LOCKED”消息时，我们不再主动断开连接。
            // 而是只触发 session:locked 事件，让 SessionLockManager 来处理UI显示和轮询。
            // 这样可以避免在控制台产生不必要的“错误”日志，并允许在应用解锁后无缝接管。
            EventBus.emit('session:locked');

            // 移除了以下主动断开连接的代码块:
            // if (this.stompClient) {
            //     this.stompClient.disconnect(() => console.log("因应用被占用，已主动断开 WebSocket 连接。"));
            // }
            // ========================= 关键修改 END ===========================
        }
    },

    _rawFetchApi: async function(endpoint, options = {}, responseType = 'json') {
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
            switch (responseType) {
                case 'json':
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) return response.json();
                    return response.text();
                case 'text':
                    return response.text();
                case 'blob':
                    return response.blob();
                default:
                    return response;
            }
        } catch (error) {
            EventBus.emit('log:error', `[网络错误] ${error.message}`);
            throw error;
        }
    },


    uploadFilesToPath: function(files, destinationPath) {
        if (!Config.currentProject) {
            return Promise.reject(new Error("没有活动的项来粘贴文件。"));
        }

        const formData = new FormData();
        formData.append('projectPath', Config.currentProject);
        formData.append('destinationPath', destinationPath);
        files.forEach(file => {
            formData.append('files', file, file.name);
        });

        return this._uploadWithXHR('api/files/upload-to-path', formData);
    },


    fetchApi: async function(endpoint, options = {}, responseType = 'json') {
        let finalEndpoint = endpoint;
        let finalOptions = { ...options };

        if (Config.currentProject) {
            const method = (finalOptions.method || 'GET').toUpperCase();
            const bodyJson = finalOptions.body && typeof finalOptions.body === 'string' ? JSON.parse(finalOptions.body) : null;

            if (['POST', 'PUT'].includes(method) && bodyJson && !('projectPath' in bodyJson)) {
                bodyJson.projectPath = Config.currentProject;
                finalOptions.body = JSON.stringify(bodyJson);
            } else if (!finalEndpoint.includes('projectPath=')) {
                const separator = finalEndpoint.includes('?') ? '&' : '?';
                finalEndpoint += `${separator}projectPath=${encodeURIComponent(Config.currentProject)}`;
            }
        }
        return this._rawFetchApi(finalEndpoint, finalOptions, responseType);
    },

    // --- API wrapper methods (unchanged) ---
    getProjects: () => NetworkManager._rawFetchApi('api/projects'),
    getFileTree: (relativePath = '') => NetworkManager.fetchApi(`api/files/tree?path=${encodeURIComponent(relativePath)}`),
    getFileContent: (relativePath) => NetworkManager.fetchApi(`api/files/content?path=${encodeURIComponent(relativePath)}`, {}, 'text'),
    downloadFileAsBlob: (relativePath) => NetworkManager.fetchApi(`api/files/content?path=${encodeURIComponent(relativePath)}`, {}, 'blob'),
    saveFileContent: (relativePath, content) => NetworkManager.fetchApi('api/files/content', { method: 'POST', body: JSON.stringify({ path: relativePath, content }) }),
    buildProject: () => NetworkManager.fetchApi(`api/java/build`, { method: 'POST' }),
    getGitStatus: () => NetworkManager.fetchApi(`api/git/status`),
    gitCommit: (message) => NetworkManager.fetchApi('api/git/commit', { method: 'POST', body: JSON.stringify({ message }) }),
    gitPull: () => NetworkManager.fetchApi(`api/git/pull`, { method: 'POST' }),
    gitPush: () => NetworkManager.fetchApi(`api/git/push`, { method: 'POST' }),
    createFileOrDir: (parentPath, name, type) => NetworkManager.fetchApi('api/files/create', { method: 'POST', body: JSON.stringify({ parentPath, name, type }) }),
    deletePath: (path) => NetworkManager.fetchApi(`api/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
    renamePath: (oldPath, newName) => NetworkManager.fetchApi('api/files/rename', { method: 'PUT', body: JSON.stringify({ oldPath, newName }) }),
    getRemoteRepos: () => NetworkManager._rawFetchApi('api/git/remote-repos'),
    cloneSpecificRepo: (cloneUrl) => NetworkManager._rawFetchApi('api/git/clone-specific', { method: 'POST', body: JSON.stringify({ cloneUrl }) }),
    startDebug: (mainClass) => NetworkManager.fetchApi('api/debug/start', { method: 'POST', body: JSON.stringify({ mainClass: mainClass }) }),
    stopDebug: () => NetworkManager.fetchApi('api/debug/stop', { method: 'POST' }),
    stepOver: () => NetworkManager.fetchApi('api/debug/stepOver', { method: 'POST' }),
    stepInto: () => NetworkManager.fetchApi('api/debug/stepInto', { method: 'POST' }),
    stepOut: () => NetworkManager.fetchApi('api/debug/stepOut', { method: 'POST' }),
    resumeDebug: () => NetworkManager.fetchApi('api/debug/resume', { method: 'POST' }),
    // ========================= 关键修改 START =========================
    toggleBreakpoint: (filePath, lineNumber, enabled) => NetworkManager._rawFetchApi('api/debug/breakpoint/toggle', { method: 'POST', body: JSON.stringify({ filePath, lineNumber, enabled }) }),
    // ========================= 关键修改 END ===========================
    getSettings: () => NetworkManager._rawFetchApi('api/settings'),
    saveSettings: (settings) => NetworkManager._rawFetchApi('api/settings', { method: 'POST', body: JSON.stringify(settings) }),
    getProjectClassNames: (projectName) => NetworkManager._rawFetchApi(`api/java/class-names?projectPath=${encodeURIComponent(projectName)}`),
    stopRun: () => NetworkManager._rawFetchApi('api/run/stop', { method: 'POST' }),

    startTerminal: (path) => {
        if (NetworkManager.stompClient && NetworkManager.isConnected) {
            const targetPath = path || Config.currentProject || "";
            NetworkManager.stompClient.send('/app/terminal/start', {}, targetPath);
        }
    },
    sendTerminalInput: (data) => {
        if (NetworkManager.stompClient && NetworkManager.isConnected) {
            NetworkManager.stompClient.send('/app/terminal/input', {}, data);
        }
    },

    _uploadWithXHR: function(endpoint, formData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', this.baseUrl + endpoint, true);

            xhr.upload.onprogress = (event) => EventBus.emit('progress:update', { value: event.loaded, total: event.total, message: `上传中... ${Math.round((event.loaded / event.total) * 100)}%` });
            xhr.onloadstart = () => EventBus.emit('progress:start', { message: '开始上传...', total: 1 });
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject(new Error(`上传失败: ${xhr.status} ${xhr.responseText}`));
                }
            };
            xhr.onerror = () => reject(new Error('网络错误，无法完成上传。'));
            xhr.onloadend = () => EventBus.emit('progress:finish');

            xhr.send(formData);
        });
    },

    uploadDirectoryStructure: function(items, destinationPath) {
        if (!Config.currentProject) {
            return Promise.reject(new Error("没有活动项目以上传文件。"));
        }
        const formData = new FormData();
        formData.append('projectPath', Config.currentProject);
        formData.append('destinationPath', destinationPath);
        items.forEach(({ file, path }) => {
            formData.append('files', file, path);
        });
        return this._uploadWithXHR('api/files/upload-to-path', formData);
    },

    uploadProject: async function(directoryHandle, projectName) {
        EventBus.emit('statusbar:updateStatus', '正在分析文件夹...');
        const filesToUpload = await this._getFilesRecursively(directoryHandle);
        if (filesToUpload.length === 0) {
            EventBus.emit('log:warn', "选择的文件夹为空。");
            return;
        }

        const formData = new FormData();
        formData.append('projectPath', projectName);
        filesToUpload.forEach(({ file, path }) => formData.append('files', file, path));

        return this._uploadWithXHR('api/files/replace-project', formData);
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