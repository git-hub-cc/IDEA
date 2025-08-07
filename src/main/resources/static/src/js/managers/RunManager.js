// src/js/managers/RunManager.js - 程序运行状态管理器

import EventBus from '../utils/event-emitter.js';

/**
 * @description 负责跟踪当前是否有程序正在运行。
 * 它通过监听来自 NetworkManager 的 WebSocket 状态消息来更新自身状态，
 * 并广播一个全局事件以通知UI组件（如工具栏）更新。
 */
const RunManager = {
    isRunning: false,

    /**
     * @description 初始化运行管理器。
     */
    init: function() {
        this.bindAppEvents();
    },

    /**
     * @description 绑定应用事件，主要监听后端的运行状态变更。
     */
    bindAppEvents: function() {
        EventBus.on('run:statusChanged', this.handleStatusChange.bind(this));
    },

    /**
     * @description 处理后端发送的运行状态变更。
     * @param {'STARTED' | 'FINISHED'} status - 新的状态。
     */
    handleStatusChange: function(status) {
        const wasRunning = this.isRunning;
        this.isRunning = (status === 'STARTED');

        // 仅在状态实际发生变化时才发出事件，避免不必要的UI重绘
        if (wasRunning !== this.isRunning) {
            console.log(`运行状态变更为: ${status}`);
            EventBus.emit('run:stateUpdated', this.isRunning);
        }
    },

    /**
     * @description 检查当前是否有程序在运行。
     * @returns {boolean} 如果有程序在运行，则返回 true。
     */
    isProgramRunning: function() {
        return this.isRunning;
    }
};

export default RunManager;