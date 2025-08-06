// src/js/managers/SessionLockManager.js

import NetworkManager from './NetworkManager.js';
import EventBus from '../utils/event-emitter.js';

const SessionLockManager = {
    overlay: null,
    countdownElement: null,
    pollingInterval: null,
    countdownInterval: null,
    POLL_RATE_MS: 5000,
    onAppReadyCallback: null,

    /**
     * 初始化会话锁管理器。这是整个应用启动的入口点。
     * @param {Function} onAppReady - 当应用可以安全启动时要执行的回调函数。
     */
    init(onAppReady) {
        this.overlay = document.getElementById('lock-screen-overlay');
        this.countdownElement = document.getElementById('lock-screen-countdown');
        this.onAppReadyCallback = onAppReady;

        // ========================= 关键修改 START: 添加防御性检查 =========================
        if (!this.overlay || !this.countdownElement) {
            console.error("致命错误: 无法找到会话锁定屏幕的核心DOM元素。锁定功能将无法正常工作。");
            // 既然锁定屏幕坏了，就直接尝试启动应用，避免整个应用卡住。
            if (onAppReady) {
                onAppReady();
            }
            return;
        }
        // ========================= 关键修改 END ========================================

        this.bindEvents();
        this.checkLockStatus();
    },

    bindEvents() {
        EventBus.on('session:locked', () => {
            this.showLockScreen();
            this.startPolling();
        });
    },

    /**
     * 检查后端应用的锁定状态。
     */
    async checkLockStatus() {
        try {
            // ========================= 关键修改 START: 使用 NetworkManager =========================
            const status = await NetworkManager.getSessionStatus();
            // ========================= 关键修改 END ============================================
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
                    this.onAppReadyCallback = null;
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
     * 显示等待遮罩层。
     */
    showLockScreen() {
        if (this.overlay) {
            this.overlay.classList.add('visible');
        }
    },

    /**
     * 隐藏等待遮罩层。
     */
    hideLockScreen() {
        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
    },

    /**
     * 启动周期性轮询以检查应用状态。
     */
    startPolling() {
        if (this.pollingInterval) return;

        this.pollingInterval = setInterval(() => {
            this.checkLockStatus();
        }, this.POLL_RATE_MS);

        this.startCountdown();
    },

    /**
     * 停止轮询。
     */
    stopPolling() {
        clearInterval(this.pollingInterval);
        clearInterval(this.countdownInterval);
        this.pollingInterval = null;
        this.countdownInterval = null;
    },

    /**
     * 启动并更新倒计时UI。
     */
    startCountdown() {
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        let countdown = this.POLL_RATE_MS / 1000;

        // ========================= 关键修改 START: 在使用前检查元素是否存在 =========================
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
        // ========================= 关键修改 END ========================================
    },
};

export default SessionLockManager;