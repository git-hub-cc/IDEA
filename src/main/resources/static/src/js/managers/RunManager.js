// src/js/managers/RunManager.js

import EventBus from '../utils/event-emitter.js';

const RunManager = {
    isRunning: false,

    init() {
        this.bindAppEvents();
    },

    bindAppEvents() {
        // 监听来自 NetworkManager 的 WebSocket 状态消息
        EventBus.on('run:statusChanged', this.handleStatusChange.bind(this));
    },

    /**
     * 处理后端发送的运行状态变更。
     * @param {'STARTED' | 'FINISHED'} status - 新的状态。
     */
    handleStatusChange(status) {
        const wasRunning = this.isRunning;
        this.isRunning = (status === 'STARTED');

        // 仅在状态实际发生变化时才发出事件
        if (wasRunning !== this.isRunning) {
            console.log(`Run status changed to: ${status}`);
            // 广播一个全局事件，通知UI（如ToolbarManager）更新
            EventBus.emit('run:stateUpdated', this.isRunning);
        }
    },

    /**
     * 检查当前是否有程序在运行。
     * @returns {boolean}
     */
    isProgramRunning() {
        return this.isRunning;
    }
};

export default RunManager;