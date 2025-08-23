// src/js/managers/NetworkManager.js - 网络通信管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';

/**
 * @description 封装了所有与后端服务器的通信，包括 RESTful API 和 WebSocket。
 * 这是一个核心管理器，为其他模块提供统一的数据访问接口。
 */
const NetworkManager = {
    baseUrl: '',
    stompClient: null,
    isConnected: false,
    sessionId: null,

    /**
     * @description 初始化网络管理器，绑定事件并准备连接WebSocket。
     */
    init: function() {
        this.onBuildLogReceived = this.onBuildLogReceived.bind(this);
        this.onRunLogReceived = this.onRunLogReceived.bind(this);
        this.onDebugEventReceived = this.onDebugEventReceived.bind(this);
        this.onRunStatusReceived = this.onRunStatusReceived.bind(this);
        this.onSessionStatusReceived = this.onSessionStatusReceived.bind(this);
        this.onSystemMetricsReceived = this.onSystemMetricsReceived.bind(this);
        EventBus.on('app:ready', () => this.connectWebSocket());
    },

    /**
     * @description 连接到后端的WebSocket服务。
     * @returns {Promise<void>}
     */
    connectWebSocket: function() {
        if (this.isConnected) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const socket = new SockJS(this.baseUrl + 'ws');
            this.stompClient = Stomp.over(socket);
            this.stompClient.debug = null;
            this.stompClient.heartbeat.outgoing = 10000;
            this.stompClient.heartbeat.incoming = 10000;

            this.stompClient.connect({}, (frame) => {
                this.isConnected = true;
                const urlParts = socket._transport.url.split('/');
                this.sessionId = urlParts[urlParts.length - 2];
                this.subscribeToTopics();
                EventBus.emit('network:websocketConnected');
                resolve();
            }, (error) => {
                this.isConnected = false;
                this.sessionId = null;
                EventBus.emit('network:websocketDisconnected', error);
                console.error('WebSocket 连接错误: ' + error);
                setTimeout(() => console.log("尝试重新连接 WebSocket..."), 5000);
                reject(error);
            });
        });
    },

    /**
     * @description 订阅所有需要的WebSocket主题。
     */
    subscribeToTopics: function() {
        if (!this.stompClient || !this.isConnected) return;
        this.stompClient.subscribe('/topic/build-log', this.onBuildLogReceived);
        this.stompClient.subscribe('/topic/run-log', this.onRunLogReceived);
        this.stompClient.subscribe('/topic/debug-events', this.onDebugEventReceived);
        this.stompClient.subscribe('/topic/run/status', this.onRunStatusReceived);
        this.stompClient.subscribe(`/topic/terminal-output/${this.sessionId}`, (message) => {
            EventBus.emit('terminal:data', message.body);
        });
        this.stompClient.subscribe('/user/queue/session/status', this.onSessionStatusReceived);
        this.stompClient.subscribe('/topic/system-metrics', this.onSystemMetricsReceived);
        EventBus.emit('log:info', '已成功订阅后端日志、调试和运行状态事件。');
    },

    /** @description 处理构建日志消息 */
    onBuildLogReceived: function(message) { EventBus.emit('console:log', '[构建]\n' + message.body); },
    /** @description 处理运行日志消息 */
    onRunLogReceived: function(message) { EventBus.emit('console:log', message.body); },
    /** @description 处理调试事件消息 */
    onDebugEventReceived: function(message) { try { EventBus.emit('debugger:eventReceived', JSON.parse(message.body)); } catch (e) { EventBus.emit('log:error', '解析调试事件失败: ' + e.message); } },
    /** @description 处理运行状态消息 */
    onRunStatusReceived: function(message) { EventBus.emit('run:statusChanged', message.body); },
    /** @description 处理会话锁定状态消息 */
    onSessionStatusReceived: function(message) { if (message.body === 'LOCKED') EventBus.emit('session:locked'); },
    /** @description 处理系统监控数据消息 */
    onSystemMetricsReceived: function(message) { try { const data = JSON.parse(message.body); EventBus.emit('monitor:data-update', data); } catch (e) { console.error('解析系统监控数据失败:', e); } },

    /**
     * @description 从localStorage获取Git凭证。
     * @returns {object} 包含token, platform, sshKeyPath, sshPassphrase的对象。
     * @private
     */
    _getGitCredentials: function() {
        return {
            token: localStorage.getItem('git_access_token') || '',
            platform: localStorage.getItem('git_platform') || 'gitee',
            sshKeyPath: localStorage.getItem('git_ssh_key_path') || '',
            sshPassphrase: localStorage.getItem('git_ssh_passphrase') || ''
        };
    },

    /**
     * @description 底层的 fetch API 包装器，统一处理全局繁忙状态和错误。
     * @param {string} endpoint - API 端点路径。
     * @param {object} [options={}] - fetch 选项。
     * @param {string} [responseType='json'] - 期望的响应类型 ('json', 'text', 'blob')。
     * @param {boolean} [showBusy=true] - 是否在此请求期间显示全局繁忙指示器。
     * @returns {Promise<any>}
     * @private
     */
    _rawFetchApi: async function(endpoint, options = {}, responseType = 'json', showBusy = true) {
        if (showBusy) EventBus.emit('network:request-start');
        try {
            const url = this.baseUrl + endpoint;
            const response = await fetch(url, {
                headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json', ...options.headers },
                ...options,
            });
            if (!response.ok) {
                const errorText = await response.text();
                const errorData = { message: errorText || response.statusText };
                try { Object.assign(errorData, JSON.parse(errorText)); } catch (e) { /* 忽略 */ }
                const error = new Error(`API错误 ${response.status}: ${JSON.stringify(errorData)}`);
                throw error;
            }
            switch (responseType) {
                case 'json': return response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
                case 'text': return await response.text();
                case 'blob': return await response.blob();
                default: return response;
            }
        } catch (error) {
            EventBus.emit('log:error', `[网络错误] ${error.message}`);
            throw error;
        } finally {
            if (showBusy) EventBus.emit('network:request-end');
        }
    },

    /**
     * @description 包装了 _rawFetchApi，自动为请求注入当前项目路径。
     * @param {string} endpoint - API 端点路径。
     * @param {object} [options={}] - fetch 选项。
     * @param {string} [responseType='json'] - 期望的响应类型。
     * @param {boolean} [showBusy=true] - 是否显示繁忙指示器。
     * @returns {Promise<any>}
     */
    fetchApi: async function(endpoint, options = {}, responseType = 'json', showBusy = true) {
        let finalEndpoint = endpoint;
        let finalOptions = { ...options };
        if (Config.currentProject) {
            const method = (finalOptions.method || 'GET').toUpperCase();
            if (['POST', 'PUT'].includes(method) && finalOptions.body) {
                const bodyJson = JSON.parse(finalOptions.body);
                if (!('projectPath' in bodyJson)) {
                    bodyJson.projectPath = Config.currentProject;
                    finalOptions.body = JSON.stringify(bodyJson);
                }
            } else if (!finalEndpoint.includes('projectPath=')) {
                finalEndpoint += `${finalEndpoint.includes('?') ? '&' : '?'}projectPath=${encodeURIComponent(Config.currentProject)}`;
            }
        }
        return this._rawFetchApi(finalEndpoint, finalOptions, responseType, showBusy);
    },

    getProjects: function() { return this._rawFetchApi('api/projects'); },
    getFileTree: function(relativePath = '') { return this.fetchApi(`api/files/tree?path=${encodeURIComponent(relativePath)}`); },
    getFileContent: function(relativePath) { return this.fetchApi(`api/files/content?path=${encodeURIComponent(relativePath)}`, {}, 'text'); },
    downloadFileAsBlob: function(relativePath) { return this.fetchApi(`api/files/content?path=${encodeURIComponent(relativePath)}`, {}, 'blob'); },
    saveFileContent: function(relativePath, content) { return this.fetchApi('api/files/content', { method: 'POST', body: JSON.stringify({ path: relativePath, content }) }); },
    buildProject: function(mainClass) { return this.fetchApi(`api/java/build?mainClass=${encodeURIComponent(mainClass)}`, { method: 'POST' }); },
    getMainClasses: function() { return this.fetchApi('api/java/main-classes'); },
    createFileOrDir: function(parentPath, name, type) { return this.fetchApi('api/files/create', { method: 'POST', body: JSON.stringify({ parentPath, name, type }) }); },
    deletePath: function(path) { return this.fetchApi(`api/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }); },
    renamePath: function(oldPath, newName) { return this.fetchApi('api/files/rename', { method: 'PUT', body: JSON.stringify({ oldPath, newName }) }); },
    startDebug: function(mainClass) { return this.fetchApi('api/debug/start', { method: 'POST', body: JSON.stringify({ mainClass: mainClass }) }); },
    stopDebug: function() { return this.fetchApi('api/debug/stop', { method: 'POST' }); },
    stepOver: function() { return this.fetchApi('api/debug/stepOver', { method: 'POST' }); },
    stepInto: function() { return this.fetchApi('api/debug/stepInto', { method: 'POST' }); },
    stepOut: function() { return this.fetchApi('api/debug/stepOut', { method: 'POST' }); },
    resumeDebug: function() { return this.fetchApi('api/debug/resume', { method: 'POST' }); },
    toggleBreakpoint: function(filePath, lineNumber, enabled) { return this._rawFetchApi('api/debug/breakpoint/toggle', { method: 'POST', body: JSON.stringify({ filePath, lineNumber, enabled }) }); },
    getSettings: function() { return this._rawFetchApi('api/settings'); },
    saveSettings: function(settings) { return this._rawFetchApi('api/settings', { method: 'POST', body: JSON.stringify(settings) }); },
    getProjectClassNames: function(projectName) { return this._rawFetchApi(`api/java/class-names?projectPath=${encodeURIComponent(projectName)}`); },
    stopRun: function() { return this._rawFetchApi('api/run/stop', { method: 'POST' }); },
    getSessionStatus: function() { return this._rawFetchApi('api/session/status', {}, 'json', false); },
    // ========================= 新增方法 START =========================
    formatJavaCode: function(code) { return this._rawFetchApi('api/java/format', { method: 'POST', body: JSON.stringify({ code }) }); },
    // ========================= 新增方法 END ===========================
    deleteProject: function(projectName) { return this._rawFetchApi(`api/projects/${encodeURIComponent(projectName)}`, { method: 'DELETE' }); },


    // --- Git Methods with Authentication ---

    getRemoteRepos: function() {
        const { platform, token } = this._getGitCredentials();
        const endpoint = `api/git/remote-repos?platform=${platform}`;
        const headers = { 'Authorization': `Bearer ${token}` };
        return this._rawFetchApi(endpoint, { headers });
    },

    cloneSpecificRepo: function(cloneUrl) {
        const { token } = this._getGitCredentials();
        const body = JSON.stringify({ cloneUrl, token });
        return this._rawFetchApi('api/git/clone-specific', { method: 'POST', body });
    },

    getGitStatus: function() {
        const { token } = this._getGitCredentials();
        const headers = { 'Authorization': `Bearer ${token}` };
        return this.fetchApi(`api/git/status`, { headers }, 'json', false);
    },

    gitCommit: function(message) {
        // Commit is a local operation, no auth needed for the commit itself.
        // Auth will be needed for push.
        return this.fetchApi('api/git/commit', { method: 'POST', body: JSON.stringify({ message }) });
    },

    gitPull: function() {
        const creds = this._getGitCredentials();
        const body = JSON.stringify({ ...creds });
        return this.fetchApi(`api/git/pull`, { method: 'POST', body });
    },

    gitPush: function() {
        const creds = this._getGitCredentials();
        const body = JSON.stringify({ ...creds });
        return this.fetchApi(`api/git/push`, { method: 'POST', body });
    },


    // --- Terminal Methods ---
    startTerminal: function(path) { if (this.stompClient && this.isConnected) { this.stompClient.send('/app/terminal/start', {}, path || Config.currentProject || ""); } },
    sendTerminalInput: function(data) { if (this.stompClient && this.isConnected) { this.stompClient.send('/app/terminal/input', {}, data); } },


    // --- Upload Methods ---
    _uploadWithXHR: function(endpoint, formData) {
        EventBus.emit('network:request-start');
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', this.baseUrl + endpoint, true);
            xhr.upload.onprogress = (e) => EventBus.emit('progress:update', { value: e.loaded, total: e.total });
            xhr.onloadstart = () => EventBus.emit('progress:start', { message: '开始上传...', total: 1 });
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                else reject(new Error(`上传失败: ${xhr.status} ${xhr.responseText}`));
            };
            xhr.onerror = () => reject(new Error('网络错误，无法完成上传。'));
            xhr.onloadend = () => { EventBus.emit('progress:finish'); EventBus.emit('network:request-end'); };
            xhr.send(formData);
        });
    },

    uploadDirectoryStructure: function(items, destinationPath) {
        if (!Config.currentProject) return Promise.reject(new Error("没有活动项目以上传文件。"));
        const formData = new FormData();
        formData.append('projectPath', Config.currentProject);
        formData.append('destinationPath', destinationPath);
        items.forEach(({ file, path }) => formData.append('files', file, path));
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
                files.push({ file: file, path: newPath });
            } else if (entry.kind === 'directory') {
                files.push(...await this._getFilesRecursively(entry, newPath));
            }
        }
        return files;
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
};

export default NetworkManager;