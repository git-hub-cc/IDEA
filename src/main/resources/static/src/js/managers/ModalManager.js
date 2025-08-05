// src/js/managers/ModalManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

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
            const modal = target.closest('.modal');

            if (target === overlay || target.closest('.modal-close-btn')) {
                this._close(false);
            } else if (actionBtn && actionBtn.dataset.action === 'confirm-modal' && !actionBtn.disabled) {
                if (actionBtn.dataset.type === 'settings') {
                    this._handleSettingsConfirm();
                } else {
                    if (modal && modal.dataset.type !== 'list-prompt') {
                        this._close(true, 'confirm');
                    }
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
        EventBus.on('modal:showListPrompt', this.showListPrompt.bind(this));
        EventBus.on('modal:showChoiceModal', this.showChoiceModal.bind(this));
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

        footerEl.style.display = options.showFooter === false ? 'none' : 'flex';
        modal.dataset.type = options.type || 'default';
        modal.dataset.isRepoSelection = options.isRepoSelection ? 'true' : 'false';

        if (options.showFooter !== false) {
            const confirmBtn = footerEl.querySelector('[data-action="confirm-modal"]');
            const cancelBtn = footerEl.querySelector('[data-action="cancel-modal"]');

            if (options.type !== 'choice') {
                footerEl.innerHTML = `
                    <button class="modal-action-btn primary-btn" data-action="confirm-modal">确认</button>
                    <button class="modal-action-btn secondary-btn" data-action="cancel-modal">取消</button>
                `;
            }
            const newConfirmBtn = footerEl.querySelector('[data-action="confirm-modal"]');
            const newCancelBtn = footerEl.querySelector('[data-action="cancel-modal"]');

            if (newConfirmBtn) {
                newConfirmBtn.textContent = options.confirmText || '确认';
                newConfirmBtn.dataset.type = options.type || 'default';
                newConfirmBtn.disabled = false;
            }
            if(newCancelBtn) {
                newCancelBtn.textContent = options.cancelText || '取消';
                newCancelBtn.style.display = options.showCancel === false ? 'none' : 'inline-block';
            }


            if (options.isRepoSelection && newConfirmBtn) {
                const repoList = bodyEl.querySelector('#repo-selection-list');
                newConfirmBtn.disabled = true;

                if (repoList) {
                    repoList.addEventListener('click', (e) => {
                        const selectedItem = e.target.closest('.repo-item-label');
                        if (selectedItem) {
                            newConfirmBtn.disabled = false;
                            repoList.querySelectorAll('.repo-item-label').forEach(label => label.classList.remove('selected'));
                            selectedItem.classList.add('selected');
                        }
                    });
                }
            }
        }

        overlay.classList.add('visible');
        const input = bodyEl.querySelector('input, textarea, select');
        if (input) {
            setTimeout(() => {
                input.focus();
                if (typeof input.select === 'function') input.select();
            }, 50);
        }

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    },

    _close: function(confirmed, value) {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('common-modal');
        const bodyEl = document.getElementById('modal-body');
        if (!overlay || !this.resolvePromise) return;

        if (confirmed) {
            if (modal.dataset.isRepoSelection === 'true') {
                const selectedItem = bodyEl.querySelector('.repo-item-label.selected');
                this.resolvePromise(selectedItem ? selectedItem.dataset.cloneUrl : null);
            } else if (modal.dataset.type === 'choice') {
                this.resolvePromise(value);
            } else {
                const input = bodyEl.querySelector('input[type="text"], textarea');
                this.resolvePromise(input ? input.value : true);
            }
        } else {
            this.rejectPromise(new Error('用户取消了操作。'));
        }

        overlay.classList.remove('visible');
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.currentSettings = null;
    },

    showRepoSelectionModal: function(repos) {
        if (!repos || repos.length === 0) {
            return this.showAlert('没有可用的仓库', '未能从远程平台获取任何公开仓库。');
        }

        let ownerName = '该用户';
        const firstValidRepo = repos.find(repo => repo.cloneUrl && repo.cloneUrl.includes('/'));
        if (firstValidRepo) {
            ownerName = firstValidRepo.cloneUrl.split('/')[3];
        }

        const bodyHtml = `
            <p>请从 ${ownerName} 的公开仓库中选择一个进行克隆:</p>
            <div id="repo-selection-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); margin-top: 10px; border-radius: 4px;">
                ${repos.map((repo) => {
            const cloneUrl = repo.cloneUrl || '';
            const description = repo.description ? (repo.description.length > 100 ? repo.description.substring(0, 97) + '...' : repo.description) : '没有描述';
            return `
                        <div class="repo-item-label" data-clone-url="${cloneUrl}">
                            <div class="repo-item-details">
                                <strong>${repo.name || '无名仓库'}</strong>
                                <p>${description}</p>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        return this._show('选择要克隆的仓库', bodyHtml, {
            confirmText: '克隆',
            isRepoSelection: true
        });
    },

    showListPrompt: function({ title, items, onConfirm }) {
        const modalBody = document.createElement('div');
        modalBody.className = 'command-palette';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '搜索指令...';
        input.className = 'modal-search-input';

        const listContainer = document.createElement('ul');
        listContainer.className = 'modal-list';

        modalBody.appendChild(input);
        modalBody.appendChild(listContainer);

        let activeIndex = 0;

        const renderList = (filter = '') => {
            listContainer.innerHTML = '';
            const filteredItems = items.filter(item =>
                item.label.toLowerCase().includes(filter.toLowerCase()) ||
                (item.description && item.description.toLowerCase().includes(filter.toLowerCase()))
            );

            if (filteredItems.length === 0) {
                listContainer.innerHTML = `<li class="modal-list-item disabled">无匹配结果</li>`;
                return;
            }

            filteredItems.forEach((item, index) => {
                const li = document.createElement('li');
                li.className = 'modal-list-item';
                li.dataset.id = item.id;
                li.innerHTML = `
                    <div class="item-label">${item.label}</div>
                    <div class="item-description">${item.description || ''}</div>
                `;
                if (index === 0) {
                    li.classList.add('active');
                }
                listContainer.appendChild(li);
            });
            updateActiveItem();
        };

        const updateActiveItem = () => {
            const allItems = listContainer.querySelectorAll('.modal-list-item');
            allItems.forEach((item, index) => {
                item.classList.toggle('active', index === activeIndex);
            });
            const activeElem = listContainer.querySelector('.active');
            if (activeElem) {
                activeElem.scrollIntoView({ block: 'nearest' });
            }
        };

        const selectItem = (id) => {
            this._close(false);
            if (onConfirm) onConfirm(id);
        };

        input.addEventListener('input', () => {
            activeIndex = 0;
            renderList(input.value);
        });

        modalBody.addEventListener('click', (e) => {
            const itemElement = e.target.closest('.modal-list-item');
            if (itemElement && !itemElement.classList.contains('disabled')) {
                selectItem(itemElement.dataset.id);
            }
        });

        input.addEventListener('keydown', (e) => {
            const items = listContainer.querySelectorAll('.modal-list-item:not(.disabled)');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = (activeIndex + 1) % items.length;
                updateActiveItem();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = (activeIndex - 1 + items.length) % items.length;
                updateActiveItem();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const activeItem = items[activeIndex];
                if (activeItem && activeItem.dataset.id) {
                    selectItem(activeItem.dataset.id);
                }
            }
        });

        renderList('');

        this._show(title, modalBody, { showFooter: false, type: 'list-prompt' })
            .catch(() => {});

        setTimeout(() => input.focus(), 50);
    },

    // ========================= 关键修改 START: 重构设置模态框以支持多平台 =========================
    showSettings: function(settings) {
        this.currentSettings = settings;

        const body = document.createElement('div');
        body.className = 'settings-modal-body';

        body.innerHTML = `
            <div class="modal-tabs">
                <button class="modal-tab active" data-tab="app-settings-pane">应用设置</button>
                <button class="modal-tab" data-tab="git-settings-pane">Git 设置</button>
            </div>
            <div class="modal-tab-content">
                <div id="app-settings-pane" class="tab-pane active">
                    <div class="settings-item">
                        <label for="settings-theme">主题</label>
                        <select id="settings-theme">
                            <option value="dark-theme">深色主题 (Darcula)</option>
                            <option value="light-theme">浅色主题 (Light)</option>
                        </select>
                    </div>
                    <div class="settings-item">
                        <label for="settings-font-size">编辑器字号</label>
                        <input type="number" id="settings-font-size" min="10" max="24" step="1">
                    </div>
                    <div class="settings-item">
                        <label for="settings-word-wrap">自动换行</label>
                        <select id="settings-word-wrap">
                            <option value="true">开启</option>
                            <option value="false">关闭</option>
                        </select>
                    </div>
                </div>
                <div id="git-settings-pane" class="tab-pane">
                    <div class="settings-item">
                        <label for="settings-git-platform">代码托管平台</label>
                        <select id="settings-git-platform">
                            <option value="gitee">Gitee</option>
                            <option value="github">GitHub</option>
                        </select>
                    </div>
                    <div class="settings-item">
                        <label for="settings-gitee-token">访问令牌 (Access Token)</label>
                        <input type="password" id="settings-gitee-token" placeholder="用于 API 访问和 HTTPS 克隆">
                        <small id="git-token-help" style="color: var(--text-secondary); font-size: 0.8em; display: block; margin-top: 4px;"></small>
                    </div>
                    <div class="settings-item">
                        <label for="settings-ssh-key-path">SSH 私钥绝对路径</label>
                        <input type="text" id="settings-ssh-key-path" placeholder="例如 C:/Users/YourName/.ssh/id_ed25519">
                    </div>
                    <div class="settings-item">
                        <label for="settings-ssh-passphrase">SSH 私钥密码</label>
                        <input type="password" id="settings-ssh-passphrase" placeholder="如果私钥有密码，在此输入">
                    </div>
                </div>
            </div>
        `;

        // --- 填充设置值 ---
        body.querySelector('#settings-theme').value = settings.theme;
        body.querySelector('#settings-font-size').value = settings.fontSize;
        body.querySelector('#settings-word-wrap').value = String(settings.wordWrap);
        body.querySelector('#settings-git-platform').value = settings.gitPlatform || 'gitee';
        body.querySelector('#settings-gitee-token').value = settings.giteeAccessToken || '';
        body.querySelector('#settings-ssh-key-path').value = settings.giteeSshPrivateKeyPath || '';
        body.querySelector('#settings-ssh-passphrase').value = settings.giteeSshPassphrase || '';

        // --- 动态帮助链接逻辑 ---
        const platformSelector = body.querySelector('#settings-git-platform');
        const helpTextElement = body.querySelector('#git-token-help');
        const tokenLinks = {
            gitee: 'https://gitee.com/personal_access_tokens',
            github: 'https://github.com/settings/personal-access-tokens'
        };

        const updateHelpLink = (platform) => {
            const url = tokenLinks[platform];
            helpTextElement.innerHTML = `不知道如何获取？点击 <a href="${url}" target="_blank" rel="noopener noreferrer">这里</a> 生成一个。`;
        };

        platformSelector.addEventListener('change', (e) => updateHelpLink(e.target.value));
        updateHelpLink(platformSelector.value); // 初始化

        // --- 标签页切换逻辑 ---
        const tabs = body.querySelectorAll('.modal-tab');
        const panes = body.querySelectorAll('.tab-pane');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const targetPaneId = tab.dataset.tab;
                panes.forEach(pane => pane.classList.toggle('active', pane.id === targetPaneId));
            });
        });

        return this._show('应用设置', body, { confirmText: '保存', type: 'settings' });
    },
    // ========================= 关键修改 END ============================================

    showChoiceModal: function({ title, message, choices = [] }) {
        const body = document.createElement('div');
        body.innerHTML = `<p style="margin-bottom: 15px;">${message}</p>`;

        const footerEl = document.getElementById('modal-footer');
        const choiceButtons = choices.map(choice => {
            const button = document.createElement('button');
            button.className = 'modal-action-btn primary-btn';
            button.textContent = choice.text;
            button.onclick = () => this._close(true, choice.id);
            return button;
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-action-btn secondary-btn';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = () => this._close(false);

        footerEl.innerHTML = '';
        choiceButtons.forEach(btn => footerEl.appendChild(btn));
        footerEl.appendChild(cancelBtn);

        return this._show(title, body, { type: 'choice' });
    },

    _handleSettingsConfirm: async function() {
        const newSettings = {
            theme: document.getElementById('settings-theme').value,
            fontSize: parseInt(document.getElementById('settings-font-size').value, 10),
            wordWrap: document.getElementById('settings-word-wrap').value === 'true',
            editorFontFamily: this.currentSettings.editorFontFamily,
            // --- 读取新字段 ---
            gitPlatform: document.getElementById('settings-git-platform').value,
            giteeAccessToken: document.getElementById('settings-gitee-token').value,
            giteeSshPrivateKeyPath: document.getElementById('settings-ssh-key-path').value,
            giteeSshPassphrase: document.getElementById('settings-ssh-passphrase').value,
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
};

export default ModalManager;