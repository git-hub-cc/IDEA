// src/js/utils/ThemeManager.js - 主题管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from '../managers/NetworkManager.js';

/**
 * @description 主题管理器，负责应用主题的切换和持久化。
 */
const ThemeManager = {
    themeLink: null,
    currentTheme: 'dark-theme',

    /**
     * @description 初始化主题管理器。
     * 它会从 localStorage 加载上次的主题以防止闪烁，然后从后端同步最终设置。
     */
    init: function() {
        this.themeLink = document.getElementById('theme-link');
        this.bindEvents();

        const savedTheme = localStorage.getItem('ideTheme') || this.currentTheme;
        this.setTheme(savedTheme);

        EventBus.on('app:ready', async function() {
            try {
                const settings = await NetworkManager.getSettings();
                this.applySettings(settings);
            } catch (e) {
                console.warn("无法加载初始设置，将使用本地缓存的主题。", e);
            }
        }.bind(this));
    },

    /**
     * @description 绑定应用事件，主要监听设置变更。
     */
    bindEvents: function() {
        // ========================= 核心修改 START =========================
        EventBus.on('settings:changed', this.applySettings.bind(this));
        // ========================= 核心修改 END ===========================
    },

    /**
     * @description 应用从设置对象中提取的主题配置。
     * @param {object} settings - 从后端获取的设置对象。
     * @param {{x: number, y: number}|null} [coordinates] - 触发变更的点击坐标。
     */
    applySettings: function(settings, coordinates) {
        if (settings && settings.theme) {
            // ========================= 核心修改 START =========================
            this.setTheme(settings.theme, coordinates);
            // ========================= 核心修改 END ===========================
        }
    },

    /**
     * @description 设置并应用一个新的主题。
     * @param {string} themeName - 主题名称，例如 'dark-theme' 或 'light-theme'。
     * @param {{x: number, y: number}|null} [clickCoords] - 触发切换的点击坐标。
     */
    setTheme: function(themeName, clickCoords) {
        if (!themeName || this.currentTheme === themeName) {
            return;
        }

        const transitionLogic = () => {
            document.body.classList.remove('dark-theme', 'light-theme');
            document.body.classList.add(themeName);
            const themeFileName = themeName.includes('dark') ? 'dark' : 'light';
            this.themeLink.href = `src/css/theme-${themeFileName}.css`;
            this.currentTheme = themeName;
            localStorage.setItem('ideTheme', themeName);
            EventBus.emit('theme:changed', themeName);
        };

        // ========================= 核心修改 START =========================
        // 检查浏览器是否支持 View Transitions API
        if (!document.startViewTransition) {
            transitionLogic();
            return;
        }

        // 获取点击坐标，如果未提供，则默认为屏幕中心
        const x = clickCoords?.x ?? window.innerWidth / 2;
        const y = clickCoords?.y ?? window.innerHeight / 2;

        // 计算到最远角落的距离，作为圆形动画的半径
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        // 使用CSS变量将动态值传递给CSS动画
        document.documentElement.style.setProperty('--clip-x', x + 'px');
        document.documentElement.style.setProperty('--clip-y', y + 'px');
        document.documentElement.style.setProperty('--clip-r', endRadius + 'px');

        // 启动视图过渡
        const transition = document.startViewTransition(transitionLogic);

        // 在过渡完成后清理CSS变量
        transition.finished.finally(() => {
            document.documentElement.style.removeProperty('--clip-x');
            document.documentElement.style.removeProperty('--clip-y');
            document.documentElement.style.removeProperty('--clip-r');
        });
        // ========================= 核心修改 END ===========================
    },

    /**
     * @description 获取当前激活的主题名称。
     * @returns {string} 当前主题名。
     */
    getCurrentTheme: function() {
        return this.currentTheme;
    }
};

export default ThemeManager;