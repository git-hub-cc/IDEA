// src/js/utils/theme-manager.js - 主题管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from '../managers/NetworkManager.js';

const ThemeManager = {
    themeLink: null,
    currentTheme: 'dark-theme',

    init: function() {
        this.themeLink = document.getElementById('theme-link');
        this.bindEvents();

        // 启动时，从 localStorage 加载主题以避免闪烁，然后再从后端同步
        const savedTheme = localStorage.getItem('ideTheme') || this.currentTheme;
        this.setTheme(savedTheme);

        EventBus.on('app:ready', async () => {
            try {
                const settings = await NetworkManager.getSettings();
                this.applySettings(settings);
            } catch (e) {
                console.warn("无法加载初始设置，将使用本地缓存的主题。", e);
            }
        });
    },

    bindEvents: function() {
        EventBus.on('settings:changed', this.applySettings.bind(this));
    },

    applySettings: function(settings) {
        if (settings && settings.theme) {
            this.setTheme(settings.theme);
        }
    },

    setTheme: function(themeName) {
        if (!themeName || this.currentTheme === themeName) return;

        document.body.classList.remove('dark-theme', 'light-theme');
        document.body.classList.add(themeName);

        const themeFileName = themeName.split('-')[0];
        this.themeLink.href = `src/css/theme-${themeFileName}.css`;
        this.currentTheme = themeName;

        // ========================= 关键修改 START: 将主题选择持久化到 localStorage =========================
        localStorage.setItem('ideTheme', themeName);
        // ========================= 关键修改 END ====================================================

        EventBus.emit('theme:changed', themeName);
    },

    getCurrentTheme: function() {
        return this.currentTheme;
    }
};

export default ThemeManager;