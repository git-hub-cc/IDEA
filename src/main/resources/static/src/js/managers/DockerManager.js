// src/js/managers/DockerManager.js - Docker 面板管理器 (新增)

import EventBus from '../utils/event-emitter.js';
import NetworkManager from './NetworkManager.js';
import TemplateLoader from '../utils/TemplateLoader.js';
import MonitorManager from './MonitorManager.js';

/**
 * @description 管理 "Docker" 面板的所有 UI 和逻辑。
 */
const DockerManager = {
    panel: null,
    isInitialized: false,
    selectedResourceId: null,
    selectedResourceType: null,
    logStreamActive: false,
    terminalStreamActive: false,

    /**
     * @description 初始化 Docker 管理器。
     */
    init: function() {
        this.panel = document.getElementById('docker-panel');
        if (!this.panel) return;

        this.bindAppEvents();

        // 惰性加载：仅当用户首次点击 Docker 标签页时才进行完全设置。
        if (this.panel.classList.contains('active')) {
            this.setupPanel();
        }
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        EventBus.on('ui:activateBottomPanelTab', (panelId) => {
            if (panelId === 'docker-panel' && !this.isInitialized) {
                this.setupPanel();
            }
        });

        // 监听来自上下文菜单的动作
        EventBus.on('docker-action:start-container', ({ id }) => this.startContainer(id));
        EventBus.on('docker-action:stop-container', ({ id }) => this.stopContainer(id));
        EventBus.on('docker-action:restart-container', ({ id }) => this.restartContainer(id));
        EventBus.on('docker-action:remove-container', ({ id, name }) => this.removeContainer(id, name));
    },

    /**
     * @description 执行面板的首次设置。
     */
    async setupPanel() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        EventBus.emit('log:info', 'Docker 面板已初始化。');

        this.renderInitialLayout();
        this.bindPanelEvents();
        await this.loadAndRenderResources();
    },

    /**
     * @description 渲染面板的初始两栏布局。
     */
    renderInitialLayout() {
        const template = TemplateLoader.get('docker-panel-template');
        this.panel.innerHTML = '';
        this.panel.appendChild(template);
    },

    /**
     * @description 绑定 Docker 面板内部的 DOM 事件。
     */
    bindPanelEvents() {
        this.panel.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (button) {
                this.handleActionClick(button);
                return;
            }

            const resourceItem = e.target.closest('.resource-item');
            if (resourceItem) {
                this.handleResourceSelect(resourceItem);
            }
        });
    },

    /**
     * @description 处理面板内的动作按钮点击。
     */
    handleActionClick(button) {
        const action = button.dataset.action;
        const id = this.selectedResourceId;
        const name = this.panel.querySelector('.resource-item.selected')?.dataset.name;

        switch(action) {
            case 'docker-refresh':
                this.loadAndRenderResources();
                break;
            case 'docker-start-container':
                this.startContainer(id);
                break;
            case 'docker-stop-container':
                this.stopContainer(id);
                break;
            case 'docker-restart-container':
                this.restartContainer(id);
                break;
            case 'docker-remove-container':
                this.removeContainer(id, name);
                break;
        }
    },

    /**
     * @description 处理资源列表项的选择。
     */
    handleResourceSelect(item) {
        const id = item.dataset.id;
        if (this.selectedResourceId === id) return;

        this.panel.querySelectorAll('.resource-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');

        this.selectedResourceId = id;
        this.selectedResourceType = item.dataset.type;

        if (this.selectedResourceType === 'container') {
            this.renderContainerDetails(id);
        }
    },

    /**
     * @description 加载并渲染所有 Docker 资源到左侧列表。
     */
    async loadAndRenderResources() {
        EventBus.emit('statusbar:updateStatus', '正在加载 Docker 资源...');
        const [containers, images] = await Promise.all([
            NetworkManager.getDockerContainers(),
            NetworkManager.getDockerImages()
        ]);
        EventBus.emit('statusbar:updateStatus', '就绪');

        const body = this.panel.querySelector('.docker-resource-body');
        body.innerHTML = '';

        this.renderResourceCategory(body, '容器', containers, this.renderContainerItem);
        this.renderResourceCategory(body, '镜像', images, this.renderImageItem);
    },

    /**
     * @description 渲染一个资源分类（如“容器”）。
     */
    renderResourceCategory(parent, title, items, renderFunc) {
        const categoryTpl = TemplateLoader.get('docker-resource-category-template');
        categoryTpl.querySelector('.category-name').textContent = title;
        categoryTpl.querySelector('.category-count').textContent = items.length;
        const ul = categoryTpl.querySelector('.resource-list-ul');
        items.forEach(item => ul.appendChild(renderFunc.call(this, item)));
        parent.appendChild(categoryTpl);
    },

    /**
     * @description 渲染一个容器列表项。
     */
    renderContainerItem(container) {
        const tpl = TemplateLoader.get('docker-container-item-template');
        const item = tpl.querySelector('.resource-item');
        item.dataset.id = container.id;
        item.dataset.type = 'container';
        item.dataset.name = container.name;
        item.dataset.state = container.state;

        const statusIndicator = item.querySelector('.status-indicator');
        statusIndicator.className = 'status-indicator'; // Reset classes
        statusIndicator.classList.add(container.state);
        statusIndicator.title = container.status;

        item.querySelector('.resource-name').textContent = container.name;
        item.querySelector('.resource-subtext').textContent = container.image;

        return item;
    },

    /**
     * @description 渲染一个镜像列表项。
     */
    renderImageItem(image) {
        const tpl = TemplateLoader.get('docker-image-item-template');
        const item = tpl.querySelector('.resource-item');
        item.dataset.id = image.id;
        item.dataset.type = 'image';
        item.querySelector('.resource-name').textContent = image.tags[0];
        item.querySelector('.resource-subtext').textContent = `${image.id} | ${MonitorManager.formatBytes(image.size)}`;
        return item;
    },

    /**
     * @description 渲染右侧的容器详情面板。
     */
    async renderContainerDetails(containerId) {
        const detailsPanel = this.panel.querySelector('.docker-details-panel');
        const detailsTpl = TemplateLoader.get('docker-container-details-template');

        // 获取容器基础信息以更新头部
        const containers = await NetworkManager.getDockerContainers();
        const container = containers.find(c => c.id === containerId);
        if (!container) return;

        detailsTpl.querySelector('.status-indicator').className = `status-indicator ${container.state}`;
        detailsTpl.querySelector('.container-name').textContent = container.name;
        detailsTpl.querySelector('.container-id').textContent = container.id;

        const isRunning = container.state === 'running';
        detailsTpl.querySelector('[data-action="docker-start-container"]').style.display = isRunning ? 'none' : 'inline-flex';
        detailsTpl.querySelector('[data-action="docker-stop-container"]').style.display = isRunning ? 'inline-flex' : 'none';
        detailsTpl.querySelector('[data-action="docker-restart-container"]').style.display = isRunning ? 'inline-flex' : 'none';

        detailsPanel.innerHTML = '';
        detailsPanel.appendChild(detailsTpl);

        // 设置详情面板内的标签页逻辑
        const tabs = detailsPanel.querySelectorAll('.modal-tab');
        const panes = detailsPanel.querySelectorAll('.tab-pane');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const targetPaneId = tab.dataset.tab;
                panes.forEach(pane => pane.classList.toggle('active', pane.id === targetPaneId));
                this.handleDetailTabActivate(targetPaneId, containerId);
            });
        });

        // 默认激活概览标签页
        this.handleDetailTabActivate('docker-overview-pane', containerId);
    },

    /**
     * @description 处理详情面板中标签页的激活事件。
     */
    handleDetailTabActivate(paneId, containerId) {
        switch(paneId) {
            case 'docker-overview-pane':
                this.setupOverviewPane(containerId);
                break;
            case 'docker-logs-pane':
                // this.setupLogsPane(containerId);
                break;
            case 'docker-terminal-pane':
                // this.setupTerminalPane(containerId);
                break;
            case 'docker-inspect-pane':
                this.setupInspectPane(containerId);
                break;
        }
    },

    async setupOverviewPane(containerId) {
        const pane = this.panel.querySelector('#docker-overview-pane');
        const template = TemplateLoader.get('docker-overview-pane-template');

        const details = await NetworkManager.getDockerContainerInspect(containerId);
        const inspectData = JSON.parse(details.inspectJson);

        template.querySelector('.status-text').textContent = inspectData.State.Status;
        template.querySelector('.image-text').textContent = inspectData.Config.Image;
        template.querySelector('.created-text').textContent = new Date(inspectData.Created).toLocaleString();

        const ports = inspectData.HostConfig.PortBindings;
        const portsList = template.querySelector('.ports-list');
        portsList.innerHTML = Object.entries(ports).map(([containerPort, hostBindings]) =>
            hostBindings.map(binding => `<li>${binding.HostIp || '0.0.0.0'}:${binding.HostPort} -> ${containerPort}</li>`).join('')
        ).join('') || '<li>无端口映射</li>';

        pane.innerHTML = '';
        pane.appendChild(template);

        // 初始化图表
        // 注意: 实际的 stats 数据需要通过 WebSocket 持续推送，这里只设置图表结构
        const cpuCanvas = pane.querySelector('.docker-cpu-chart');
        const memCanvas = pane.querySelector('.docker-mem-chart');
        MonitorManager.createChart(cpuCanvas, '容器 CPU (%)', {y: {min: 0, max: 100}}, [{label: 'CPU', borderColor: '#FFB74D'}]);
        MonitorManager.createChart(memCanvas, '容器内存', {y: {min: 0, ticks: {callback: v => MonitorManager.formatBytes(v)}}}, [{label: '内存', borderColor: '#64B5F6'}]);
    },

    async setupInspectPane(containerId) {
        const pane = this.panel.querySelector('#docker-inspect-pane');
        pane.innerHTML = '<div class="monaco-container"></div>';

        const details = await NetworkManager.getDockerContainerInspect(containerId);

        if (window.monaco) {
            monaco.editor.create(pane.querySelector('.monaco-container'), {
                value: details.inspectJson,
                language: 'json',
                readOnly: true,
                theme: document.body.classList.contains('dark-theme') ? 'vs-dark' : 'vs',
                automaticLayout: true,
            });
        } else {
            const pre = document.createElement('pre');
            pre.textContent = details.inspectJson;
            pane.innerHTML = '';
            pane.appendChild(pre);
        }
    },

    // --- 容器操作方法 ---
    async startContainer(id) {
        await NetworkManager.startDockerContainer(id);
        EventBus.emit('log:info', `容器 ${id.substring(0, 12)} 已启动。`);
        this.loadAndRenderResources();
    },

    async stopContainer(id) {
        await NetworkManager.stopDockerContainer(id);
        EventBus.emit('log:info', `容器 ${id.substring(0, 12)} 已停止。`);
        this.loadAndRenderResources();
    },

    async restartContainer(id) {
        await NetworkManager.restartDockerContainer(id);
        EventBus.emit('log:info', `容器 ${id.substring(0, 12)} 已重启。`);
        this.loadAndRenderResources();
    },

    async removeContainer(id, name) {
        EventBus.emit('modal:showConfirm', {
            title: '确认删除容器',
            message: `您确定要永久删除容器 "${name}" (${id.substring(0,12)}) 吗？此操作不可撤销。`,
            onConfirm: async () => {
                await NetworkManager.removeDockerContainer(id);
                EventBus.emit('log:info', `容器 ${name} 已删除。`);
                if (this.selectedResourceId === id) {
                    this.panel.querySelector('.docker-details-panel').innerHTML = '<div class="docker-details-welcome"><i class="fab fa-docker"></i><p>从左侧选择一个资源以查看详情。</p></div>';
                    this.selectedResourceId = null;
                }
                this.loadAndRenderResources();
            }
        });
    }
};

export default DockerManager;