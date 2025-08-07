// src/js/managers/ToolbarManager.js - 工具栏与调试控制按钮管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from './NetworkManager.js';

/**
 * @description 管理顶部工具栏和调试器控制面板中的所有按钮的事件和状态。
 */
const ToolbarManager = {
    projectSelector: null,
    projectDependentButtons: null,
    runButton: null,
    debugButton: null,

    /**
     * @description 初始化工具栏管理器。
     */
    init: function() {
        const toolbar = document.getElementById('toolbar');
        const debuggerControls = document.querySelector('#debugger-panel .debugger-controls');
        this.projectSelector = document.getElementById('project-selector');

        // 缓存需要项目上下文才能操作的按钮
        this.projectDependentButtons = toolbar.querySelectorAll(
            '[data-action="new-file"], [data-action="save-file"], [data-action="run-code"], ' +
            '[data-action="debug-code"], [data-action="vcs-commit"], [data-action="vcs-pull"], ' +
            '[data-action="vcs-push"]'
        );

        this.runButton = toolbar.querySelector('[data-action="run-code"]');
        this.debugButton = toolbar.querySelector('[data-action="debug-code"]');

        this.bindButtons(toolbar.querySelectorAll('.toolbar-btn'));
        this.bindButtons(debuggerControls.querySelectorAll('button'));

        this.initProjectSelector();
        this.bindAppEvents();
        this.updateButtonStates(); // 初始状态检查
    },

    /**
     * @description 绑定应用级事件监听器。
     */
    bindAppEvents: function() {
        EventBus.on('project:list-updated', this.populateProjectSelector.bind(this));
        EventBus.on('project:activated', this.updateButtonStates.bind(this));
        EventBus.on('run:stateUpdated', this.updateRunButtonState.bind(this));
    },

    /**
     * @description 根据当前是否有活动项目来更新按钮的启用/禁用状态。
     */
    updateButtonStates: function() {
        const hasActiveProject = !!Config.currentProject;
        this.projectDependentButtons.forEach(function(button) {
            button.disabled = !hasActiveProject;
            button.style.opacity = hasActiveProject ? '1' : '0.5';
            button.style.cursor = hasActiveProject ? 'pointer' : 'not-allowed';
        });
        // 确保在没有项目时，运行状态也是重置的
        if (!hasActiveProject) {
            this.updateRunButtonState(false);
        }
    },

    /**
     * @description 根据程序是否正在运行来更新运行/停止按钮的UI和行为。
     * @param {boolean} isRunning - 程序是否正在运行。
     */
    updateRunButtonState: function(isRunning) {
        if (!this.runButton || !this.debugButton) {
            return;
        }

        this.runButton.classList.toggle('is-running', isRunning);

        if (isRunning) {
            this.runButton.title = '停止运行 (Ctrl+F2)';
            // 当程序运行时，禁用调试按钮
            this.debugButton.disabled = true;
            this.debugButton.classList.add('is-running');
        } else {
            this.runButton.title = '运行代码 (Shift+F10)';
            // 只有当有活动项目时才重新启用调试按钮
            const hasActiveProject = !!Config.currentProject;
            this.debugButton.disabled = !hasActiveProject;
            this.debugButton.classList.remove('is-running');
        }
    },

    /**
     * @description 初始化项目选择器，包括加载项目列表和绑定change事件。
     */
    initProjectSelector: async function() {
        this.projectSelector.addEventListener('change', function(e) {
            Config.setActiveProject(e.target.value || null);
        });

        try {
            const projects = await NetworkManager.getProjects();
            Config.setProjectList(projects);
            const lastActive = Config.getLastActiveProject();
            if (lastActive && projects.includes(lastActive)) {
                Config.setActiveProject(lastActive);
            }
        } catch (error) {
            EventBus.emit('log:error', `获取项目列表失败: ${error.message}`);
        }
    },

    /**
     * @description 使用项目列表填充项目选择器的选项。
     * @param {string[]} projects - 项目名称数组。
     */
    populateProjectSelector: function(projects) {
        this.projectSelector.innerHTML = '<option value="">-- 选择项目 --</option>';
        projects.forEach(function(project) {
            const option = document.createElement('option');
            option.value = project;
            option.textContent = project;
            this.projectSelector.appendChild(option);
        }, this);
        this.projectSelector.value = Config.currentProject || "";
    },

    /**
     * @description 为一组按钮绑定点击事件，触发对应的全局action。
     * @param {NodeListOf<Element>} buttons - 要绑定的按钮集合。
     */
    bindButtons: function(buttons) {
        buttons.forEach(function(button) {
            button.addEventListener('click', function() {
                if (button.disabled) {
                    return;
                }
                const action = button.dataset.action;
                if (action) {
                    EventBus.emit(`action:${action}`);
                }
            });
        });
    }
};

export default ToolbarManager;