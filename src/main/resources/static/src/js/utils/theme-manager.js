// src/js/utils/theme-manager.js - 主题管理器

import EventBus from './event-emitter.js';
import NetworkManager from '../managers/NetworkManager.js';

const ThemeManager = {
    themeLink: null,
    currentTheme: 'dark-theme',

    init: function() {
        this.themeLink = document.getElementById('theme-link');
        this.bindEvents();

        // On startup, try to load settings from the backend to apply the theme
        EventBus.on('app:ready', async () => {
            try {
                const settings = await NetworkManager.getSettings();
                this.applySettings(settings);
            } catch (e) {
                console.warn("Could not load initial settings, using default theme.", e);
                this.setTheme(this.currentTheme);
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
        if (!themeName) return;
        document.body.classList.remove('dark-theme', 'light-theme');
        document.body.classList.add(themeName);

        const themeFileName = themeName.split('-')[0];
        this.themeLink.href = `src/css/theme-${themeFileName}.css`;
        this.currentTheme = themeName;

        EventBus.emit('theme:changed', themeName);
    },

    getCurrentTheme: function() {
        return this.currentTheme;
    }
};

export default ThemeManager;