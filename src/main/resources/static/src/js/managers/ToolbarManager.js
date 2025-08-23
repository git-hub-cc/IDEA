// src/js/managers/ToolbarManager.js - 工具栏与调试控制按钮管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from './NetworkManager.js';
import RunManager from './RunManager.js';
import DebuggerManager from './DebuggerManager.js';

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
        EventBus.on('run:stateUpdated', this.updateButtonStates.bind(this));
        EventBus.on('debugger:stateUpdated', this.updateButtonStates.bind(this));
    },

    /**
     * @description 根据当前是否有活动项目来更新按钮的启用/禁用状态。
     */
    updateButtonStates: function() {
        const hasActiveProject = !!Config.currentProject;
        const isPendingRun = RunManager.isPending;
        const isPendingDebug = DebuggerManager.isPending;

        // 仅在程序实际运行时才认为其处于活动状态，以应用红色样式和停止图标
        const isRunning = RunManager.isRunning;
        const isDebugging = DebuggerManager.isDebugging;

        // 用于判断是否应禁用其他按钮的更广泛的状态
        const isAnyProcessActive = isRunning || isPendingRun || isDebugging || isPendingDebug;

        // 步骤 1: 根据项目是否存在，设置一个基础的禁用状态
        this.projectDependentButtons.forEach(function(button) {
            button.disabled = !hasActiveProject;
        });

        // 步骤 2: 根据运行/调试状态，覆盖和调整特定按钮的样式和禁用状态
        if (this.runButton) {
            this.runButton.classList.toggle('is-active', isRunning);
            this.runButton.disabled = !hasActiveProject || isAnyProcessActive;
            if (isRunning) this.runButton.disabled = false; // 如果正在运行，按钮必须是可点击以停止的
            this.runButton.title = isRunning ? '停止运行 (Ctrl+F2) / 点击停止' : '运行代码 (Shift+F10)';
        }

        if (this.debugButton) {
            this.debugButton.classList.toggle('is-active', isDebugging);
            this.debugButton.disabled = !hasActiveProject || isAnyProcessActive;
            if (isDebugging) this.debugButton.disabled = false; // 如果正在调试，按钮也必须是可点击以停止的
            this.debugButton.title = isDebugging ? '停止调试 (Ctrl+F2) / 点击停止' : '调试代码 (Shift+F9)';
        }

        // 步骤 3: 统一根据最终的 `disabled` 属性来设置视觉样式
        this.projectDependentButtons.forEach(function(button) {
            button.style.opacity = button.disabled ? '0.5' : '1';
            button.style.cursor = button.disabled ? 'not-allowed' : 'pointer';
        });
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