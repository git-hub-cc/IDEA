// src/js/managers/ModalManager.js - 弹窗管理器

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import ThemeManager from '../utils/theme-manager.js';

const ModalManager = {
    resolvePromise: null,
    rejectPromise: null,
    currentSettings: null,

    init: function() {
        this.bindDOMEvents();
        this.bindAppEvents();
    },

    bindDOMEvents: function() {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) {
            console.error("致命错误：无法找到 #modal-overlay。");
            return;
        }

        overlay.addEventListener('click', (e) => {
            const target = e.target;
            const actionBtn = target.closest('.modal-action-btn');

            if (target === overlay || target.closest('.modal-close-btn')) {
                this._close(false);
            } else if (actionBtn && actionBtn.dataset.action === 'confirm-modal') {
                if (actionBtn.dataset.type === 'settings') {
                    this._handleSettingsConfirm();
                } else {
                    this._close(true);
                }
            } else if (actionBtn && actionBtn.dataset.action === 'cancel-modal') {
                this._close(false);
            }
        });
    },

    bindAppEvents: function() {
        EventBus.on('modal:showAlert', (options) => this.showAlert(options.title, options.message));
        EventBus.on('modal:showConfirm', (options) => {
            this.showConfirm(options.title, options.message)
                .then(() => options.onConfirm && options.onConfirm())
                .catch(() => options.onCancel && options.onCancel());
        });
        EventBus.on('modal:showPrompt', (options) => {
            this.showPrompt(options.title, options.message, options.defaultValue)
                .then((value) => options.onConfirm && options.onConfirm(value))
                .catch(() => options.onCancel && options.onCancel());
        });
        EventBus.on('modal:showSettings', (settings) => this.showSettings(settings));
        EventBus.on('modal:close', () => this._close(false));
    },

    _show: function(title, bodyContent, options = {}) {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('common-modal');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        const footerEl = document.getElementById('modal-footer');

        if (!overlay || !modal || !titleEl || !bodyEl || !footerEl) {
            return Promise.reject(new Error('模态框核心DOM元素未找到。'));
        }

        titleEl.textContent = title;
        bodyEl.innerHTML = '';
        if (typeof bodyContent === 'string') {
            bodyEl.innerHTML = bodyContent;
        } else {
            bodyEl.appendChild(bodyContent);
        }

        const confirmBtn = footerEl.querySelector('[data-action="confirm-modal"]');
        const cancelBtn = footerEl.querySelector('[data-action="cancel-modal"]');
        confirmBtn.textContent = options.confirmText || '确认';
        cancelBtn.textContent = options.cancelText || '取消';
        cancelBtn.style.display = options.showCancel === false ? 'none' : 'inline-block';
        confirmBtn.dataset.type = options.type || 'default';


        overlay.classList.add('visible');

        const input = bodyEl.querySelector('input, textarea, select');
        if (input) {
            setTimeout(() => { input.focus(); input.select(); }, 50);
        }

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    },

    _close: function(confirmed) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay || !this.resolvePromise) return;

        overlay.classList.remove('visible');

        if (confirmed) {
            const input = overlay.querySelector('#modal-body input[type="text"], #modal-body textarea');
            this.resolvePromise(input ? input.value : true);
        } else {
            this.rejectPromise(new Error('用户取消了操作。'));
        }

        this.resolvePromise = null;
        this.rejectPromise = null;
        this.currentSettings = null;
    },

    showAlert: function(title, message) {
        return this._show(title, `<p>${message.replace(/\n/g, '<br>')}</p>`, { confirmText: '关闭', showCancel: false });
    },

    showConfirm: function(title, message) {
        return this._show(title, `<p>${message}</p>`);
    },

    showPrompt: function(title, message, defaultValue = '') {
        const body = document.createElement('div');
        const useTextarea = message.toLowerCase().includes('commit message');
        const p = document.createElement('p');
        p.style.marginBottom = '10px';
        p.textContent = message;

        const input = useTextarea ? document.createElement('textarea') : document.createElement('input');
        if (useTextarea) {
            input.rows = 4;
        } else {
            input.type = 'text';
        }
        input.value = defaultValue;
        body.appendChild(p);
        body.appendChild(input);
        return this._show(title, body);
    },

    showSettings: function(settings) {
        this.currentSettings = settings;
        const body = document.createElement('div');
        body.innerHTML = `
            <div>
                <label for="settings-theme">主题</label>
                <select id="settings-theme">
                    <option value="dark-theme">深色主题 (Darcula)</option>
                    <option value="light-theme">浅色主题 (Light)</option>
                </select>
            </div>
            <div>
                <label for="settings-font-size">编辑器字号</label>
                <input type="number" id="settings-font-size" min="10" max="24" step="1">
            </div>
            <div>
                <label for="settings-word-wrap">自动换行</label>
                <select id="settings-word-wrap">
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                </select>
            </div>
        `;
        body.querySelector('#settings-theme').value = settings.theme;
        body.querySelector('#settings-font-size').value = settings.fontSize;
        body.querySelector('#settings-word-wrap').value = String(settings.wordWrap);

        return this._show('应用设置', body, { confirmText: '保存', type: 'settings' });
    },

    _handleSettingsConfirm: async function() {
        const newSettings = {
            theme: document.getElementById('settings-theme').value,
            fontSize: parseInt(document.getElementById('settings-font-size').value, 10),
            wordWrap: document.getElementById('settings-word-wrap').value === 'true',
            // editorFontFamily could be added here as well
        };

        try {
            await NetworkManager.saveSettings(newSettings);
            EventBus.emit('log:info', '设置已保存。');
            EventBus.emit('settings:changed', newSettings);
            this._close(true); // Close modal on success
        } catch (error) {
            EventBus.emit('log:error', `保存设置失败: ${error.message}`);
            this.showAlert('保存失败', `无法保存设置: ${error.message}`);
            // Don't close the modal on failure
        }
    }
};

export default ModalManager;