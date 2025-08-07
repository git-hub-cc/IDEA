// src/js/utils/theme-manager.js - 主题管理器

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
        EventBus.on('settings:changed', this.applySettings.bind(this));
    },

    /**
     * @description 应用从设置对象中提取的主题配置。
     * @param {object} settings - 从后端获取的设置对象。
     */
    applySettings: function(settings) {
        if (settings && settings.theme) {
            this.setTheme(settings.theme);
        }
    },

    /**
     * @description 设置并应用一个新的主题。
     * @param {string} themeName - 主题名称，例如 'dark-theme' 或 'light-theme'。
     */
    setTheme: function(themeName) {
        if (!themeName || this.currentTheme === themeName) {
            return;
        }

        document.body.classList.remove('dark-theme', 'light-theme');
        document.body.classList.add(themeName);

        const themeFileName = themeName.includes('dark') ? 'dark' : 'light';
        this.themeLink.href = `src/css/theme-${themeFileName}.css`;
        this.currentTheme = themeName;

        localStorage.setItem('ideTheme', themeName);

        EventBus.emit('theme:changed', themeName);
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