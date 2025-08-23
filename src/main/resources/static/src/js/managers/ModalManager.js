// src/js/managers/ModalManager.js

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import Config from '../config.js';
import TemplateLoader from '../utils/TemplateLoader.js';

/**
 * @description 管理所有类型的模态框，包括提示、确认、输入、设置和列表选择。
 * 这是一个复杂的管理器，封装了模态框的显示、隐藏、数据交互和Promise化的工作流。
 */
const ModalManager = {
    resolvePromise: null,
    rejectPromise: null,
    currentSettings: null,

    /**
     * @description 初始化模态框管理器，绑定DOM和应用事件。
     */
    init: function() {
        this.bindDOMEvents();
        this.bindAppEvents();
    },

    /**
     * @description 为模态框的容器和按钮绑定事件监听器。
     */
    bindDOMEvents: function() {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) {
            console.error("致命错误：无法找到 #modal-overlay。");
            return;
        }

        overlay.addEventListener('click', function(e) {
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
        }.bind(this));
    },

    /**
     * @description 绑定应用级事件，监听来自其他模块的模态框显示请求。
     */
    bindAppEvents: function() {
        EventBus.on('modal:showAlert', (options) => this.showAlert(options.title, options.message));
        EventBus.on('modal:showConfirm', (options) => {
            this.showConfirm(options.title, options.message, options)
                .then(function() { if (options.onConfirm) options.onConfirm(); })
                .catch(function() { if (options.onCancel) options.onCancel(); });
        });
        EventBus.on('modal:showPrompt', (options) => {
            this.showPrompt(options.title, options.message, options.defaultValue)
                .then(function(value) { if (options.onConfirm) options.onConfirm(value); })
                .catch(function() { if (options.onCancel) options.onCancel(); });
        });
        EventBus.on('modal:showSettings', (settings, openTab) => this.showSettings(settings, openTab));
        EventBus.on('modal:showListPrompt', this.showListPrompt.bind(this));
        EventBus.on('modal:showChoiceModal', this.showChoiceModal.bind(this));
        EventBus.on('modal:close', () => this._close(false));
    },

    /**
     * @description 收集应用级的设置项（非Git凭证）并调用API保存。
     * @returns {Promise<void>}
     * @private
     */
    _collectAndSaveAppSettings: async function() {
        const modalBody = document.getElementById('modal-body');
        if (!modalBody.querySelector('#settings-theme')) {
            console.warn('_collectAndSaveAppSettings 无法执行，因为设置模态框未渲染。');
            return Promise.reject(new Error("设置UI未加载。"));
        }

        // 只收集非敏感的应用和环境设置
        const appSettings = {
            theme: modalBody.querySelector('#settings-theme').value,
            fontSize: parseInt(modalBody.querySelector('#settings-font-size').value, 10),
            editorFontFamily: modalBody.querySelector('#settings-editor-font').value,
            wordWrap: modalBody.querySelector('#settings-word-wrap').value === 'true',
            workspaceRoot: modalBody.querySelector('#settings-workspace-root').value,
            mavenHome: modalBody.querySelector('#settings-maven-home').value
            // JDK路径是即时保存的，这里不包含
        };

        try {
            await NetworkManager.saveSettings(appSettings);
            EventBus.emit('log:info', '应用设置已更新并保存。');
            EventBus.emit('settings:changed', { ...this.currentSettings, ...appSettings });
            return Promise.resolve();
        } catch (error) {
            EventBus.emit('log:error', `保存应用设置失败: ${error.message}`);
            this.showAlert('保存失败', `无法保存应用设置: ${error.message}`);
            return Promise.reject(error);
        }
    },

    /**
     * @description 处理设置模态框的确认按钮点击事件。
     * @private
     */
    _handleSettingsConfirm: async function() {
        const modalBody = document.getElementById('modal-body');
        const oldWorkspaceRoot = this.currentSettings ? this.currentSettings.workspaceRoot : null;
        const newWorkspaceRoot = modalBody.querySelector('#settings-workspace-root').value;

        // 步骤 1: 将Git凭证保存到localStorage
        try {
            const gitPlatform = modalBody.querySelector('#settings-git-platform').value;
            const giteeToken = modalBody.querySelector('#settings-gitee-token').value;
            const sshKeyPath = modalBody.querySelector('#settings-ssh-key-path').value;
            const sshPassphrase = modalBody.querySelector('#settings-ssh-passphrase').value;

            localStorage.setItem('git_platform', gitPlatform);
            localStorage.setItem('git_access_token', giteeToken);
            localStorage.setItem('git_ssh_key_path', sshKeyPath);
            localStorage.setItem('git_ssh_passphrase', sshPassphrase);
            EventBus.emit('log:info', 'Git 凭证已保存到浏览器本地存储。');
        } catch (e) {
            EventBus.emit('log:error', `保存Git凭证到localStorage失败: ${e.message}`);
            this.showAlert('保存失败', '无法将Git凭证保存到浏览器，请检查浏览器设置。');
            return; // 保存失败则不继续
        }

        // 步骤 2: 保存应用级设置到后端
        try {
            await this._collectAndSaveAppSettings();
            this._close(true);

            // 步骤 3: 处理工作区变更
            if (oldWorkspaceRoot !== null && oldWorkspaceRoot !== newWorkspaceRoot) {
                EventBus.emit('log:info', '工作区路径已更改，正在刷新项目列表...');
                Config.setActiveProject(null);
                try {
                    const projects = await NetworkManager.getProjects();
                    Config.setProjectList(projects);
                    this.showAlert(
                        '工作区已更新',
                        '工作区路径已更改。请从项目下拉列表中选择一个新项目。'
                    );
                } catch (error) {
                    EventBus.emit('log:error', `在工作区路径更改后刷新项目列表失败: ${error.message}`);
                    this.showAlert('错误', '无法从新的工作区加载项目列表。');
                }
            }
        } catch (error) {
            console.error('应用设置保存失败，操作被中断。', error);
        }
    },

    /**
     * @description 显示设置模态框。
     * @param {object} settings - 当前的设置对象。
     * @param {string} [openTab='app-settings-pane'] - 默认打开的标签页ID。
     * @returns {Promise}
     */
    showSettings: function(settings, openTab = 'app-settings-pane') {
        this.currentSettings = { ...settings }; // 缓存从后端获取的非敏感设置
        if (!this.currentSettings.jdkPaths) {
            this.currentSettings.jdkPaths = {};
        }

        const bodyFragment = TemplateLoader.get('settings-modal-template');
        if (!bodyFragment) return Promise.reject("Template not found");

        this._populateAppSettingsPane(bodyFragment, settings);
        this._populateGitSettingsPane(bodyFragment); // 从localStorage加载
        bodyFragment.querySelector('#settings-workspace-root').value = settings.workspaceRoot || '';
        bodyFragment.querySelector('#settings-maven-home').value = settings.mavenHome || '';

        const jdkListContainer = bodyFragment.querySelector('#jdk-paths-list');
        const addJdkBtn = bodyFragment.querySelector('#add-jdk-path-btn');

        const renderJdkList = () => {
            if (!this.currentSettings) return;
            const jdkPaths = this.currentSettings.jdkPaths;
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

        jdkListContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const settingsBeingEdited = { ...this.currentSettings }; // 操作副本
            if (!settingsBeingEdited) return;

            const action = button.dataset.action;
            const key = button.dataset.key;

            if (action === 'delete-jdk') {
                delete settingsBeingEdited.jdkPaths[key];
            } else if (action === 'edit-jdk') {
                try {
                    const currentValue = settingsBeingEdited.jdkPaths[key];
                    const { newKey, newValue } = await this._showJdkPrompt('编辑 JDK', key, currentValue);
                    if (newKey !== key) delete settingsBeingEdited.jdkPaths[key];
                    settingsBeingEdited.jdkPaths[newKey] = newValue;
                } catch (promptError) {
                    if (promptError.message !== '用户取消了操作。') {
                        EventBus.emit('log:error', `编辑JDK配置失败: ${promptError.message}`);
                        this.showAlert('保存失败', `无法编辑JDK配置: ${promptError.message}`);
                    }
                    return; // 用户取消或出错，则不继续
                }
            }

            try {
                // JDK路径是环境配置的一部分，可以保存到后端
                await NetworkManager.saveSettings(settingsBeingEdited);
                this.currentSettings = settingsBeingEdited; // 更新本地缓存
                EventBus.emit('log:info', `JDK配置已更新并保存。`);
                renderJdkList();
            } catch (saveError) {
                EventBus.emit('log:error', `保存JDK配置失败: ${saveError.message}`);
                this.showAlert('保存失败', `无法保存JDK配置: ${saveError.message}`);
            }
        });

        addJdkBtn.addEventListener('click', async () => {
            const settingsBeingEdited = { ...this.currentSettings };
            if (!settingsBeingEdited) return;

            try {
                const { newKey, newValue } = await this._showJdkPrompt('添加 JDK');
                settingsBeingEdited.jdkPaths[newKey] = newValue;
                await NetworkManager.saveSettings(settingsBeingEdited);
                this.currentSettings = settingsBeingEdited;
                EventBus.emit('log:info', `新的JDK配置 '${newKey}' 已添加并保存。`);
                renderJdkList();
            } catch (error) {
                if (error.message !== '用户取消了操作。') {
                    EventBus.emit('log:error', `添加JDK配置失败: ${error.message}`);
                    this.showAlert('保存失败', `无法添加JDK配置: ${error.message}`);
                }
            }
        });

        renderJdkList();

        const tabs = bodyFragment.querySelectorAll('.modal-tab');
        const panes = bodyFragment.querySelectorAll('.tab-pane');
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const targetPaneId = tab.dataset.tab;
                panes.forEach(pane => pane.classList.toggle('active', pane.id === targetPaneId));
            });
        });
        bodyFragment.querySelector(`.modal-tab[data-tab="${openTab}"]`).click();

        return this._show('设置', bodyFragment, { confirmText: '保存', type: 'settings' });
    },

    /**
     * @description 底层函数，用于显示模态框并返回一个 Promise。
     * @param {string} title - 模态框标题。
     * @param {string|Node} bodyContent - 模态框主体内容。
     * @param {object} [options={}] - 配置项。
     * @returns {Promise<any>}
     * @private
     */
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
            const confirmBtnText = options.confirmText || '确认';
            const cancelBtnText = options.cancelText || '取消';
            const confirmAction = 'confirm-modal';
            const cancelAction = 'cancel-modal';

            footerEl.innerHTML = `
                ${options.type !== 'choice' && options.showCancel !== false ? `<button class="modal-action-btn secondary-btn" data-action="${cancelAction}">${cancelBtnText}</button>` : ''}
                ${options.type !== 'choice' ? `<button class="modal-action-btn primary-btn" data-action="${confirmAction}">${confirmBtnText}</button>` : ''}
            `;

            const newConfirmBtn = footerEl.querySelector(`[data-action="${confirmAction}"]`);
            if (newConfirmBtn) {
                newConfirmBtn.dataset.type = options.type || 'default';
                if (options.isRepoSelection) {
                    newConfirmBtn.disabled = true;
                    const repoList = bodyEl.querySelector('#repo-selection-list');
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
        }

        overlay.classList.add('visible');
        const input = bodyEl.querySelector('input, textarea, select');
        if (input) {
            setTimeout(function() {
                input.focus();
                if (typeof input.select === 'function') input.select();
            }, 50);
        }

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    },

    /**
     * @description 关闭当前模态框，并根据用户操作 resolve 或 reject Promise。
     * @param {boolean} confirmed - 用户是否点击了确认按钮。
     * @param {any} [value] - 传递给 resolve 的值。
     * @private
     */
    _close: function(confirmed, value) {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('common-modal');
        const bodyEl = document.getElementById('modal-body');
        if (!overlay || !this.resolvePromise) return;

        const currentModalType = modal.dataset.type;

        if (confirmed) {
            if (modal.dataset.isRepoSelection === 'true') {
                const selectedItem = bodyEl.querySelector('.repo-item-label.selected');
                this.resolvePromise(selectedItem ? selectedItem.dataset.cloneUrl : null);
            } else if (currentModalType === 'choice') {
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

        if (currentModalType === 'settings') {
            this.currentSettings = null;
        }
    },

    /**
     * @description 显示一个简单的警告框。
     * @param {string} title - 标题。
     * @param {string} message - 消息内容。
     * @returns {Promise}
     */
    showAlert: function(title, message) {
        return this._show(title, `<p>${message.replace(/\n/g, '<br>')}</p>`, { confirmText: '关闭', showCancel: false });
    },

    /**
     * @description 显示一个确认对话框。
     * @param {string} title - 标题。
     * @param {string} message - 消息内容。
     * @param {object} [options={}] - 其他选项，如按钮文本。
     * @returns {Promise}
     */
    showConfirm: function(title, message, options = {}) {
        return this._show(title, `<p>${message}</p>`, options);
    },

    /**
     * @description 显示一个带输入框的提示对话框。
     * @param {string} title - 标题。
     * @param {string} message - 提示消息。
     * @param {string} [defaultValue=''] - 输入框的默认值。
     * @returns {Promise<string>}
     */
    showPrompt: function(title, message, defaultValue = '') {
        const body = document.createElement('div');
        body.innerHTML = `<p style="margin-bottom: 10px;">${message}</p>`;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        body.appendChild(input);
        return this._show(title, body);
    },

    /**
     * @description 显示一个仓库选择列表模态框。
     * @param {Array<object>} repos - 仓库对象数组。
     * @returns {Promise<string|null>}
     */
    showRepoSelectionModal: function(repos) {
        if (!repos || repos.length === 0) {
            return this.showAlert('没有可用的仓库', '未能从远程平台获取任何公开仓库。');
        }

        const bodyFragment = TemplateLoader.get('repo-selection-modal-template');
        if (!bodyFragment) return Promise.reject("Template not found");

        const repoListContainer = bodyFragment.querySelector('#repo-selection-list');
        let ownerName = '该用户';
        const firstValidRepo = repos.find(repo => repo.cloneUrl && repo.cloneUrl.includes('/'));
        if (firstValidRepo) {
            ownerName = firstValidRepo.cloneUrl.split('/')[3];
        }
        bodyFragment.querySelector('.repo-owner-name').textContent = ownerName;

        repos.forEach(function(repo) {
            const itemFragment = TemplateLoader.get('repo-item-template');
            const description = repo.description ? (repo.description.length > 100 ? repo.description.substring(0, 97) + '...' : repo.description) : '没有描述';
            itemFragment.querySelector('.repo-item-label').dataset.cloneUrl = repo.cloneUrl || '';
            itemFragment.querySelector('.repo-name').textContent = repo.name || '无名仓库';
            itemFragment.querySelector('.repo-description').textContent = description;
            repoListContainer.appendChild(itemFragment);
        });

        return this._show('选择要克隆的仓库', bodyFragment, { confirmText: '克隆', isRepoSelection: true });
    },

    /**
     * @description 显示一个可搜索的列表提示框（指令面板）。
     * @param {object} options - 配置项。
     * @param {string} options.title - 标题。
     * @param {Array<object>} options.items - 列表项数组。
     * @param {Function} options.onConfirm - 用户选择一项后调用的回调函数。
     */
    showListPrompt: function({ title, items, onConfirm }) {
        const modalBody = TemplateLoader.get('list-prompt-template');
        if (!modalBody) return;

        const input = modalBody.querySelector('.modal-search-input');
        const listContainer = modalBody.querySelector('.modal-list');
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
        listContainer.addEventListener('click', (e) => {
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
    },

    /**
     * @description 使用模板填充应用设置面板。
     * @param {Node} container - 设置模态框的容器。
     * @param {object} settings - 设置对象。
     * @private
     */
    _populateAppSettingsPane: function(container, settings) {
        const pane = container.querySelector('#app-settings-pane');
        const template = TemplateLoader.get('app-settings-pane-template');
        if (!template) return;
        template.querySelector('#settings-theme').value = settings.theme;
        template.querySelector('#settings-font-size').value = settings.fontSize;
        template.querySelector('#settings-editor-font').value = settings.editorFontFamily || 'JetBrains Mono';
        template.querySelector('#settings-word-wrap').value = String(settings.wordWrap);
        pane.appendChild(template);
    },

    /**
     * @description 使用模板和localStorage中的数据填充Git设置面板。
     * @param {Node} container - 设置模态框的容器。
     * @private
     */
    _populateGitSettingsPane: function(container) {
        const pane = container.querySelector('#git-settings-pane');
        const template = TemplateLoader.get('git-settings-pane-template');
        if (!template) return;
        template.querySelector('#settings-git-platform').value = localStorage.getItem('git_platform') || 'gitee';
        template.querySelector('#settings-gitee-token').value = localStorage.getItem('git_access_token') || '';
        template.querySelector('#settings-ssh-key-path').value = localStorage.getItem('git_ssh_key_path') || '';
        template.querySelector('#settings-ssh-passphrase').value = localStorage.getItem('git_ssh_passphrase') || '';
        pane.appendChild(template);
    },

    /**
     * @description 显示用于添加/编辑JDK路径的专用提示框。
     * @param {string} title - 提示框标题。
     * @param {string} [initialKey='jdk'] - 初始键名。
     * @param {string} [initialValue=''] - 初始路径值。
     * @returns {Promise<{newKey: string, newValue: string}>}
     * @private
     */
    _showJdkPrompt: function(title, initialKey = 'jdk', initialValue = '') {
        const bodyFragment = TemplateLoader.get('jdk-prompt-template');
        if (!bodyFragment) return Promise.reject("Template not found");

        const keyInput = bodyFragment.querySelector('#jdk-prompt-key');
        const valueInput = bodyFragment.querySelector('#jdk-prompt-value');
        keyInput.value = initialKey;
        valueInput.value = initialValue;

        return this._show(title, bodyFragment, { type: 'sub-prompt' }).then(() => {
            const newKey = keyInput.value.trim();
            const newValue = valueInput.value.trim();
            if (!newKey || !newValue) {
                this.showAlert('输入无效', '标识符和路径都不能为空。');
                return Promise.reject(new Error('标识符和路径不能为空。'));
            }
            return { newKey, newValue };
        });
    },

    /**
     * ========================= 新增方法 START =========================
     * 显示一个带有自定义按钮选项的模态框。
     *
     * @param {object} options - 配置项。
     * @param {string} options.title - 标题。
     * @param {string} options.message - 消息内容。
     * @param {Array<{id: string, text: string}>} options.choices - 按钮选项数组。
     * @returns {Promise<string>} 返回被点击按钮的 ID。
     * ========================= 新增方法 END ===========================
     */
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
    }
};

export default ModalManager;