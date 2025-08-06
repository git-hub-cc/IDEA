// src/js/managers/ModalManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';

const JDK_PATHS_STORAGE_KEY = 'web-ide-jdk-paths';

const ModalManager = {
    resolvePromise: null,
    rejectPromise: null,
    currentSettings: null,

    /**
     * 从 localStorage 安全地读取 JDK 路径配置
     * @returns {Object} JDK 路径对象，如果不存在或格式错误则返回空对象
     */
    _getJdkPathsFromStorage: function() {
        try {
            const stored = localStorage.getItem(JDK_PATHS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error('从 localStorage 加载 JDK 路径配置失败:', e);
        }
        return {};
    },

    /**
     * 将 JDK 路径对象安全地保存到 localStorage
     * @param {Object} jdkPaths 要保存的 JDK 路径对象
     */
    _saveJdkPathsToStorage: function(jdkPaths) {
        try {
            localStorage.setItem(JDK_PATHS_STORAGE_KEY, JSON.stringify(jdkPaths));
        } catch (e) {
            console.error('保存 JDK 路径配置到 localStorage 失败:', e);
        }
    },

    /**
     * 收集所有当前设置（包括表单和localStorage中的jdkPaths）并调用API保存。
     * @returns {Promise<void>}
     * @private
     */
    _collectAndSaveAllSettings: async function() {
        // 确保模态框的DOM元素存在，否则无法收集数据
        if (!document.getElementById('settings-theme')) {
            console.warn('_collectAndSaveAllSettings 无法执行，因为设置模态框未渲染。');
            return Promise.reject(new Error("设置UI未加载。"));
        }

        const newSettings = {
            // App
            theme: document.getElementById('settings-theme').value,
            fontSize: parseInt(document.getElementById('settings-font-size').value, 10),
            wordWrap: document.getElementById('settings-word-wrap').value === 'true',
            // Git
            gitPlatform: document.getElementById('settings-git-platform').value,
            giteeAccessToken: document.getElementById('settings-gitee-token').value,
            giteeSshPrivateKeyPath: document.getElementById('settings-ssh-key-path').value,
            giteeSshPassphrase: document.getElementById('settings-ssh-passphrase').value,
            // Env
            workspaceRoot: document.getElementById('settings-workspace-root').value,
            mavenHome: document.getElementById('settings-maven-home').value,
            // 直接从 localStorage 获取最终的 jdkPaths
            jdkPaths: this._getJdkPathsFromStorage(),
        };

        try {
            await NetworkManager.saveSettings(newSettings);
            // 使用更通用的消息，因为它可能在后台触发
            EventBus.emit('log:info', '设置已更新并保存。');
            EventBus.emit('settings:changed', newSettings);
            return Promise.resolve();
        } catch (error) {
            EventBus.emit('log:error', `保存设置失败: ${error.message}`);
            this.showAlert('保存失败', `无法保存设置: ${error.message}`);
            return Promise.reject(error);
        }
    },

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
            this.showConfirm(options.title, options.message, options)
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

    showConfirm: function(title, message, options = {}) {
        return this._show(title, `<p>${message}</p>`, options);
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

        return this._show('选择要克隆的仓库', bodyHtml, { confirmText: '克隆', isRepoSelection: true });
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
                li.innerHTML = `<div class="item-label">${item.label}</div><div class="item-description">${item.description || ''}</div>`;
                if (index === 0) li.classList.add('active');
                listContainer.appendChild(li);
            });
            updateActiveItem();
        };
        const updateActiveItem = () => {
            const allItems = listContainer.querySelectorAll('.modal-list-item');
            allItems.forEach((item, index) => item.classList.toggle('active', index === activeIndex));
            const activeElem = listContainer.querySelector('.active');
            if (activeElem) activeElem.scrollIntoView({ block: 'nearest' });
        };
        const selectItem = (id) => {
            this._close(false);
            if (onConfirm) onConfirm(id);
        };
        input.addEventListener('input', () => { activeIndex = 0; renderList(input.value); });
        modalBody.addEventListener('click', (e) => {
            const itemElement = e.target.closest('.modal-list-item');
            if (itemElement && !itemElement.classList.contains('disabled')) selectItem(itemElement.dataset.id);
        });
        input.addEventListener('keydown', (e) => {
            const items = listContainer.querySelectorAll('.modal-list-item:not(.disabled)');
            if (items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = (activeIndex + 1) % items.length; updateActiveItem(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = (activeIndex - 1 + items.length) % items.length; updateActiveItem(); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                const activeItem = items[activeIndex];
                if (activeItem && activeItem.dataset.id) selectItem(activeItem.dataset.id);
            }
        });
        renderList('');
        this._show(title, modalBody, { showFooter: false, type: 'list-prompt' }).catch(() => {});
        setTimeout(() => input.focus(), 50);
    },

    showSettings: function(settings, openTab = 'app-settings-pane') {
        this.currentSettings = { ...settings };
        delete this.currentSettings.jdkPaths;

        const body = document.createElement('div');
        body.className = 'settings-modal-body';
        body.innerHTML = `
            <div class="modal-tabs">
                <button class="modal-tab" data-tab="app-settings-pane">主题设置</button>
                <button class="modal-tab" data-tab="git-settings-pane">Git设置</button>
                <button class="modal-tab" data-tab="env-settings-pane">环境设置</button>
            </div>
            <div class="modal-tab-content">
                <div id="app-settings-pane" class="tab-pane"></div>
                <div id="git-settings-pane" class="tab-pane"></div>
                <div id="env-settings-pane" class="tab-pane">
                    <div class="settings-item">
                        <label for="settings-workspace-root">工作区根目录</label>
                        <input type="text" id="settings-workspace-root" placeholder="例如: C:/Users/YourName/web-ide-workspace">
                    </div>
                    <div class="settings-item">
                        <label for="settings-maven-home">Maven 主目录 (MAVEN_HOME)</label>
                        <input type="text" id="settings-maven-home" placeholder="例如: C:/tools/apache-maven-3.9.6">
                    </div>
                    <div class="settings-item">
                        <label>JDK 路径配置 (修改后自动保存到服务器)</label>
                        <div id="jdk-paths-list" class="settings-list"></div>
                        <button id="add-jdk-path-btn" class="modal-action-btn secondary-btn" style="margin-top: 10px; align-self: flex-start;">
                            <i class="fas fa-plus"></i> 添加 JDK
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._populateAppSettings(body, settings);
        this._populateGitSettings(body, settings);

        body.querySelector('#settings-workspace-root').value = settings.workspaceRoot || '';
        body.querySelector('#settings-maven-home').value = settings.mavenHome || '';

        const jdkListContainer = body.querySelector('#jdk-paths-list');
        const addJdkBtn = body.querySelector('#add-jdk-path-btn');

        const renderJdkList = () => {
            const jdkPaths = this._getJdkPathsFromStorage();
            jdkListContainer.innerHTML = '';
            if (Object.keys(jdkPaths).length === 0) {
                jdkListContainer.innerHTML = `<p class="settings-list-empty">尚未配置 JDK 路径。</p>`;
                return;
            }
            for (const [key, value] of Object.entries(jdkPaths)) {
                const item = document.createElement('div');
                item.className = 'settings-list-item';
                item.innerHTML = `
                    <span class="jdk-key">${key}</span>
                    <span class="jdk-path">${value}</span>
                    <div class="jdk-actions">
                        <button class="icon-btn" data-action="edit-jdk" data-key="${key}" title="编辑"><i class="fas fa-pen"></i></button>
                        <button class="icon-btn" data-action="delete-jdk" data-key="${key}" title="删除"><i class="fas fa-trash"></i></button>
                    </div>`;
                jdkListContainer.appendChild(item);
            }
        };

        jdkListContainer.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            const action = button.dataset.action;
            const key = button.dataset.key;
            let currentJdkPaths = this._getJdkPathsFromStorage();

            if (action === 'delete-jdk') {
                delete currentJdkPaths[key];
                this._saveJdkPathsToStorage(currentJdkPaths);
                renderJdkList();
                this._collectAndSaveAllSettings().catch(() => {});
            } else if (action === 'edit-jdk') {
                const currentValue = currentJdkPaths[key];
                this._showJdkPrompt('编辑 JDK', key, currentValue).then(({ newKey, newValue }) => {
                    currentJdkPaths = this._getJdkPathsFromStorage();
                    if (newKey !== key) delete currentJdkPaths[key];
                    currentJdkPaths[newKey] = newValue;
                    this._saveJdkPathsToStorage(currentJdkPaths);
                    renderJdkList();
                    this._collectAndSaveAllSettings().catch(() => {});
                }).catch(()=>{});
            }
        });

        addJdkBtn.addEventListener('click', () => {
            this._showJdkPrompt('添加 JDK').then(({ newKey, newValue }) => {
                const currentJdkPaths = this._getJdkPathsFromStorage();
                currentJdkPaths[newKey] = newValue;
                this._saveJdkPathsToStorage(currentJdkPaths);
                renderJdkList();
                this._collectAndSaveAllSettings().catch(() => {});
            }).catch(()=>{});
        });

        renderJdkList();

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
        body.querySelector(`.modal-tab[data-tab="${openTab}"]`).click();

        return this._show('设置', body, { confirmText: '保存到服务器', type: 'settings' });
    },

    _populateAppSettings(container, settings) {
        const pane = container.querySelector('#app-settings-pane');
        pane.innerHTML = `
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
            </div>`;
        pane.querySelector('#settings-theme').value = settings.theme;
        pane.querySelector('#settings-font-size').value = settings.fontSize;
        pane.querySelector('#settings-word-wrap').value = String(settings.wordWrap);
    },

    _populateGitSettings(container, settings) {
        const pane = container.querySelector('#git-settings-pane');
        pane.innerHTML = `
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
            </div>
            <div class="settings-item">
                <label for="settings-ssh-key-path">SSH 私钥绝对路径</label>
                <input type="text" id="settings-ssh-key-path" placeholder="例如 C:/Users/YourName/.ssh/id_ed25519">
            </div>
            <div class="settings-item">
                <label for="settings-ssh-passphrase">SSH 私钥密码</label>
                <input type="password" id="settings-ssh-passphrase" placeholder="如果私钥有密码，在此输入">
            </div>`;
        pane.querySelector('#settings-git-platform').value = settings.gitPlatform || 'gitee';
        pane.querySelector('#settings-gitee-token').value = settings.giteeAccessToken || '';
        pane.querySelector('#settings-ssh-key-path').value = settings.giteeSshPrivateKeyPath || '';
        pane.querySelector('#settings-ssh-passphrase').value = settings.giteeSshPassphrase || '';
    },

    _showJdkPrompt(title, initialKey = 'jdk', initialValue = '') {
        const body = document.createElement('div');
        body.innerHTML = `
            <div class="settings-item">
                <label for="jdk-prompt-key">JDK 标识符 (例如: jdk8, jdk11, jdk17)</label>
                <input type="text" id="jdk-prompt-key" value="${initialKey}">
            </div>
            <div class="settings-item">
                <label for="jdk-prompt-value">JDK 可执行文件路径 (java.exe)</label>
                <input type="text" id="jdk-prompt-value" value="${initialValue}" placeholder="例如: C:/Program Files/Java/jdk-17/bin/java.exe">
            </div>`;
        return this._show(title, body).then(() => {
            const newKey = body.querySelector('#jdk-prompt-key').value.trim();
            const newValue = body.querySelector('#jdk-prompt-value').value.trim();
            if (!newKey || !newValue) {
                return Promise.reject(new Error('标识符和路径不能为空。'));
            }
            return { newKey, newValue };
        });
    },

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
        try {
            await this._collectAndSaveAllSettings();
            this._close(true);
        } catch (error) {
            // 错误已由 _collectAndSaveAllSettings 处理，保持模态框打开
        }
    },
};

export default ModalManager;