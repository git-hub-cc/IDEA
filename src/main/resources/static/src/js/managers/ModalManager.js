// src/js/managers/ModalManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const ModalManager = {
    resolvePromise: null,
    rejectPromise: null,
    currentSettings: null,
    currentCloneData: null,

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
                    this._close(true, 'confirm');
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

    showAlert: function(title, message) {
        return this._show(title, `<p>${message.replace(/\n/g, '<br>')}</p>`, { confirmText: '关闭', showCancel: false });
    },
    showConfirm: function(title, message) {
        return this._show(title, `<p>${message}</p>`);
    },
    showPrompt: function(title, message, defaultValue = '') {
        const body = document.createElement('div');
        const p = document.createElement('p');
        p.style.marginBottom = '10px';
        p.textContent = message;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        body.appendChild(p);
        body.appendChild(input);
        return this._show(title, body);
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
        // 恢复确认按钮的默认状态
        confirmBtn.disabled = false;

        if (options.isRepoSelection) {
            modal.dataset.isRepoSelection = 'true';
            const repoList = bodyEl.querySelector('#repo-selection-list');

            // 确认按钮默认禁用
            confirmBtn.disabled = true;

            if (repoList) {
                // 监听 change 事件，当选择改变时启用按钮
                repoList.addEventListener('change', (e) => {
                    if (e.target.name === 'repo-selection') {
                        confirmBtn.disabled = false;
                        // 移除所有标签的选中样式
                        repoList.querySelectorAll('.repo-item-label').forEach(label => label.classList.remove('selected'));
                        // 为被选中的单选按钮的父标签添加样式
                        e.target.closest('.repo-item-label').classList.add('selected');
                    }
                });
            }
        } else {
            modal.dataset.isRepoSelection = 'false';
        }

        overlay.classList.add('visible');
        const input = bodyEl.querySelector('input, textarea, select');
        if (input) {
            setTimeout(() => {
                input.focus();
                if (typeof input.select === 'function') {
                    input.select();
                }
            }, 50);
        }

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    },

    _close: function(confirmed, actionType = 'cancel') {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('common-modal');
        const bodyEl = document.getElementById('modal-body');
        if (!overlay || !this.resolvePromise) return;

        if (confirmed && modal.dataset.isRepoSelection === 'true') {
            const selectedRadio = bodyEl.querySelector('input[name="repo-selection"]:checked');
            if (!selectedRadio) {
                // 这个逻辑现在由按钮禁用处理，但作为双重保险保留
                let feedback = modal.querySelector('.selection-feedback');
                if (!feedback) {
                    feedback = document.createElement('p');
                    feedback.className = 'selection-feedback';
                    feedback.style.color = 'var(--color-warning)';
                    feedback.style.textAlign = 'center';
                    feedback.style.marginTop = '10px';
                    modal.querySelector('#repo-selection-list').insertAdjacentElement('afterend', feedback);
                }
                feedback.textContent = '请先从列表中选择一个仓库！';
                return;
            }
            this.resolvePromise(selectedRadio.value); // 返回选中的 sshUrl
        } else if (confirmed) {
            let value;
            if (this.currentCloneData) {
                value = {
                    repositoryUrl: document.getElementById('clone-repo-url').value,
                    privateKey: document.getElementById('clone-private-key').value,
                    passphrase: document.getElementById('clone-passphrase').value
                };
            } else {
                const input = overlay.querySelector('#modal-body input[type="text"], #modal-body textarea');
                value = input ? input.value : true;
            }
            this.resolvePromise(value);
        } else {
            this.rejectPromise(new Error('用户取消了操作。'));
        }

        overlay.classList.remove('visible');
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.currentSettings = null;
        this.currentCloneData = null;
        modal.dataset.isRepoSelection = 'false';
    },

    showRepoSelectionModal: function(repos) {
        if (!repos || repos.length === 0) {
            return this.showAlert('没有可用的仓库', '未能从Gitee获取任何公开仓库。');
        }

        let ownerName = '该用户';
        const firstValidRepo = repos.find(repo => typeof repo.sshUrl === 'string' && repo.sshUrl.includes(':'));
        if (firstValidRepo) {
            ownerName = firstValidRepo.sshUrl.split(':')[1].split('/')[0];
        }

        // ========================= 关键修改：重构列表项为带单选按钮的label =========================
        const bodyHtml = `
            <p>请从 ${ownerName} 的公开仓库中选择一个进行克隆:</p>
            <div id="repo-selection-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); margin-top: 10px; border-radius: 4px;">
                ${repos.map((repo, index) => {
            const sshUrl = repo.sshUrl || '';
            // 裁剪描述
            const description = repo.description
                ? (repo.description.length > 100 ? repo.description.substring(0, 97) + '...' : repo.description)
                : '没有描述';

            return `
                        <label class="repo-item-label" for="repo-option-${index}">
                            <div class="repo-item-details">
                                <strong>${repo.name || '无名仓库'}</strong>
                                <p>${description}</p>
                            </div>
                            <input type="radio" name="repo-selection" id="repo-option-${index}" value="${sshUrl}">
                        </label>
                    `;
        }).join('')}
            </div>
        `;
        // ========================= 修改结束 =========================

        return this._show('选择要克隆的仓库', bodyHtml, {
            confirmText: '克隆',
            isRepoSelection: true
        });
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
            editorFontFamily: this.currentSettings.editorFontFamily
        };

        try {
            await NetworkManager.saveSettings(newSettings);
            EventBus.emit('log:info', '设置已保存。');
            EventBus.emit('settings:changed', newSettings);
            this._close(true);
        } catch (error) {
            EventBus.emit('log:error', `保存设置失败: ${error.message}`);
            this.showAlert('保存失败', `无法保存设置: ${error.message}`);
        }
    },

    showCloneModal: function() {
        this.currentCloneData = {};
        const body = document.createElement('div');
        body.innerHTML = `
            <p>输入 SSH 格式的仓库地址和用于认证的私钥。</p>
            <div>
                <label for="clone-repo-url">仓库地址 (SSH URL)</label>
                <input type="text" id="clone-repo-url" placeholder="git@github.com:user/repo.git">
            </div>
            <div>
                <label for="clone-private-key">私钥 (Private Key)</label>
                <textarea id="clone-private-key" rows="8" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."></textarea>
            </div>
            <div>
                <label for="clone-passphrase">私钥密码 (可选)</label>
                <input type="password" id="clone-passphrase" placeholder="如果私钥有密码，请在此输入">
            </div>
        `;
        return this._show('克隆 Git 仓库', body, { confirmText: '克隆' });
    },
};

export default ModalManager;