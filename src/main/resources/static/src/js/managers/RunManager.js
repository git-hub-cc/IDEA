// src/js/managers/RunManager.js - 程序运行状态管理器

import EventBus from '../utils/event-emitter.js';

/**
 * @description 负责跟踪当前是否有程序正在运行。
 * 它通过监听来自 NetworkManager 的 WebSocket 状态消息来更新自身状态，
 * 并广播一个全局事件以通知UI组件（如工具栏）更新。
 */
const RunManager = {
    isRunning: false,
    // ========================= 新增 START =========================
    isPending: false,
    // ========================= 新增 END ===========================

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
        // ========================= 新增 START =========================
        EventBus.on('run:pending', this.handlePending.bind(this));
        // ========================= 新增 END ===========================
    },

    // ========================= 新增 START =========================
    /**
     * @description 处理运行请求已发出的“待定”状态。
     */
    handlePending: function() {
        if (!this.isRunning && !this.isPending) {
            this.isPending = true;
            EventBus.emit('run:stateUpdated', true);
        }
    },
    // ========================= 新增 END ===========================

    /**
     * @description 处理后端发送的运行状态变更。
     * @param {'STARTED' | 'FINISHED'} status - 新的状态。
     */
    handleStatusChange: function(status) {
        const wasActive = this.isProgramRunning();
        this.isRunning = (status === 'STARTED');
        // ========================= 新增 START =========================
        this.isPending = false; // 收到后端的任何状态更新都意味着不再是待定状态
        // ========================= 新增 END ===========================

        const isActive = this.isProgramRunning();

        // 仅在状态实际发生变化时才发出事件，避免不必要的UI重绘
        if (wasActive !== isActive) {
            console.log(`运行状态变更为: ${status}`);
            EventBus.emit('run:stateUpdated', isActive);
        }
    },

    /**
     * @description 检查当前是否有程序在运行。
     * @returns {boolean} 如果有程序在运行，则返回 true。
     */
    isProgramRunning: function() {
        // ========================= 修改 START =========================
        return this.isRunning || this.isPending;
        // ========================= 修改 END ===========================
    }
};

export default RunManager;