// src/js/managers/SessionLockManager.js - 会话锁定管理器

import NetworkManager from './NetworkManager.js';
import EventBus from '../utils/event-emitter.js';

/**
 * @description 管理应用的会话锁定状态。这是整个应用启动的入口点。
 * 它会检查后端会话是否被其他用户占用，如果是，则显示一个锁定屏幕，并定期轮询状态。
 * 直到会话解锁，它才会调用回调函数来启动应用的主体部分。
 */
const SessionLockManager = {
    overlay: null,
    countdownElement: null,
    pollingInterval: null,
    countdownInterval: null,
    POLL_RATE_MS: 5000,
    onAppReadyCallback: null,

    /**
     * @description 初始化会话锁管理器。
     * @param {Function} onAppReady - 当应用可以安全启动时要执行的回调函数。
     */
    init: function(onAppReady) {
        this.overlay = document.getElementById('lock-screen-overlay');
        this.countdownElement = document.getElementById('lock-screen-countdown');
        this.onAppReadyCallback = onAppReady;

        if (!this.overlay || !this.countdownElement) {
            console.error("致命错误: 无法找到会话锁定屏幕的核心DOM元素。锁定功能将无法正常工作。");
            // 直接尝试启动应用，避免整个应用卡住
            if (onAppReady) onAppReady();
            return;
        }

        this.bindEvents();
        this.checkLockStatus();
    },

    /**
     * @description 绑定应用事件。
     */
    bindEvents: function() {
        EventBus.on('session:locked', () => {
            this.showLockScreen();
            this.startPolling();
        });
    },

    /**
     * @description 检查后端应用的锁定状态。
     */
    checkLockStatus: async function() {
        try {
            const status = await NetworkManager.getSessionStatus();
            if (status.isLocked) {
                this.showLockScreen();
                if (!this.pollingInterval) {
                    this.startPolling();
                }
            } else {
                this.hideLockScreen();
                this.stopPolling();
                if (this.onAppReadyCallback) {
                    this.onAppReadyCallback();
                    this.onAppReadyCallback = null; // 确保只执行一次
                }
            }
        } catch (error) {
            console.error("无法检查会话状态:", error);
            this.showLockScreen();
            if (!this.pollingInterval) {
                this.startPolling();
            }
        }
    },

    /**
     * @description 显示等待遮罩层。
     */
    showLockScreen: function() {
        if (this.overlay) {
            this.overlay.classList.add('visible');
        }
    },

    /**
     * @description 隐藏等待遮罩层。
     */
    hideLockScreen: function() {
        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
    },

    /**
     * @description 启动周期性轮询以检查应用状态。
     */
    startPolling: function() {
        if (this.pollingInterval) return;
        this.pollingInterval = setInterval(() => {
            this.checkLockStatus();
        }, this.POLL_RATE_MS);
        this.startCountdown();
    },

    /**
     * @description 停止轮询。
     */
    stopPolling: function() {
        clearInterval(this.pollingInterval);
        clearInterval(this.countdownInterval);
        this.pollingInterval = null;
        this.countdownInterval = null;
    },

    /**
     * @description 启动并更新倒计时UI。
     */
    startCountdown: function() {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        let countdown = this.POLL_RATE_MS / 1000;
        if (this.countdownElement) {
            this.countdownElement.textContent = countdown;
        }
        this.countdownInterval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                countdown = this.POLL_RATE_MS / 1000;
            }
            if (this.countdownElement) {
                this.countdownElement.textContent = countdown;
            }
        }, 1000);
    },
};

export default SessionLockManager;