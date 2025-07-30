// src/js/services/network-service.js - 后端网络通信服务
import { EventEmitter } from '../utils/event-emitter.js';

export class NetworkService {
    constructor(eventBus, baseUrl = '') {
        this.eventBus = eventBus;
        this.baseUrl = baseUrl;
        this.stompClient = null;
        this.isConnected = false;

        // 绑定消息处理方法，确保this指向实例
        this.onBuildLogReceived = this.onBuildLogReceived.bind(this);
        this.onRunLogReceived = this.onRunLogReceived.bind(this);
        this.onDebugEventReceived = this.onDebugEventReceived.bind(this);
    }

    // --- WebSocket Connection ---
    connectWebSocket() {
        if (this.isConnected) {
            console.log('WebSocket already connected.');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            // 使用 SockJS 作为回退，Stomp.js 提供结构化消息
            const SockJS = window.SockJS || require('sockjs-client'); // 确保 SockJS 可用
            const Stomp = window.Stomp || require('stompjs'); // 确保 Stomp 可用

            if (!SockJS || !Stomp) {
                console.error("SockJS or Stomp.js not loaded. Cannot establish WebSocket connection.");
                return reject(new Error("SockJS or Stomp.js missing."));
            }

            const socket = new SockJS(`${this.baseUrl}/ws`);
            this.stompClient = Stomp.over(socket);

            // 禁用STOMP调试信息，避免控制台刷屏
            this.stompClient.debug = null;

            this.stompClient.connect({}, (frame) => {
                console.log('Connected to WebSocket: ' + frame);
                this.isConnected = true;
                this.subscribeToTopics();
                this.eventBus.emit('websocketConnected');
                resolve();
            }, (error) => {
                console.error('WebSocket connection error: ' + error);
                this.isConnected = false;
                this.eventBus.emit('websocketDisconnected', error);
                reject(error);
            });
        });
    }

    disconnectWebSocket() {
        if (this.stompClient !== null) {
            this.stompClient.disconnect(() => {
                console.log('Disconnected from WebSocket');
                this.isConnected = false;
                this.eventBus.emit('websocketDisconnected');
            });
        }
    }

    subscribeToTopics() {
        if (!this.stompClient || !this.isConnected) {
            console.warn('Cannot subscribe: WebSocket not connected.');
            return;
        }

        // 订阅构建日志
        this.stompClient.subscribe('/topic/build-log', this.onBuildLogReceived);
        // 订阅运行日志
        this.stompClient.subscribe('/topic/run-log', this.onRunLogReceived);
        // 订阅调试事件
        this.stompClient.subscribe('/topic/debug-events', this.onDebugEventReceived);
        console.log('Subscribed to WebSocket topics.');
    }

    onBuildLogReceived(message) {
        this.eventBus.emit('buildLog', message.body);
    }

    onRunLogReceived(message) {
        this.eventBus.emit('runLog', message.body);
    }

    onDebugEventReceived(message) {
        const eventData = JSON.parse(message.body); // 假设调试事件是JSON字符串
        this.eventBus.emit('debugEvent', eventData);
    }

    // --- HTTP API Calls ---

    async fetchApi(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                ...options,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
            }

            // 尝试解析JSON，如果内容为空或不是JSON则返回原始响应
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text(); // 如果是纯文本，直接返回文本
            }

        } catch (error) {
            this.eventBus.emit('log', `[Network Error] ${error.message}`);
            console.error('NetworkService Error:', error);
            throw error; // 重新抛出错误，让调用者处理
        }
    }

    // 文件服务
    async getFileTree(path = '') {
        return this.fetchApi(`/api/files/tree?path=${encodeURIComponent(path)}`);
    }

    async getFileContent(path) {
        return this.fetchApi(`/api/files/content?path=${encodeURIComponent(path)}`);
    }

    async saveFileContent(path, content) {
        return this.fetchApi('/api/files/content', {
            method: 'POST',
            body: JSON.stringify({ path, content })
        });
    }

    async createFile(parentPath, name, type) {
        return this.fetchApi('/api/files/create', {
            method: 'POST',
            body: JSON.stringify({ parentPath, name, type })
        });
    }

    async deleteFile(path) {
        return this.fetchApi(`/api/files/delete?path=${encodeURIComponent(path)}`, {
            method: 'DELETE'
        });
    }

    async renameFile(oldPath, newPath) {
        return this.fetchApi('/api/files/rename', {
            method: 'PUT',
            body: JSON.stringify({ oldPath, newPath })
        });
    }

    // Java 服务
    async buildProject(projectPath) {
        return this.fetchApi(`/api/java/build?projectPath=${encodeURIComponent(projectPath)}`, {
            method: 'POST'
        });
    }

    async runJavaApplication(projectPath, mainClass) {
        return this.fetchApi('/api/java/run', {
            method: 'POST',
            body: JSON.stringify({ projectPath, mainClass })
        });
    }

    // 调试服务 (基于模拟，实际JPDA复杂得多)
    async startDebug(projectPath, mainClass) {
        return this.fetchApi(`/api/debug/start?projectPath=${encodeURIComponent(projectPath)}&mainClass=${encodeURIComponent(mainClass)}`, {
            method: 'POST'
        });
    }

    async stopDebug() {
        return this.fetchApi('/api/debug/stop', { method: 'POST' });
    }

    async stepOver() {
        return this.fetchApi('/api/debug/stepOver', { method: 'POST' });
    }

    async stepInto() {
        return this.fetchApi('/api/debug/stepInto', { method: 'POST' });
    }

    async stepOut() {
        return this.fetchApi('/api/debug/stepOut', { method: 'POST' });
    }

    async resumeDebug() {
        return this.fetchApi('/api/debug/resume', { method: 'POST' });
    }
}