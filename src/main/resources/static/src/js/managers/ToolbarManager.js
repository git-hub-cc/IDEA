// src/js/managers/ToolbarManager.js - 工具栏与调试控制按钮管理器

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from './NetworkManager.js';

const ToolbarManager = {
    projectSelector: null,

    /**
     * @description 初始化工具栏管理器，为所有相关按钮绑定事件。
     */
    init: function() {
        const toolbar = document.getElementById('toolbar');
        const debuggerControls = document.querySelector('#debugger-panel .debugger-controls');
        this.projectSelector = document.getElementById('project-selector');

        this.bindButtons(toolbar.querySelectorAll('.toolbar-btn'));
        this.bindButtons(debuggerControls.querySelectorAll('button'));

        this.initProjectSelector();
        this.bindAppEvents();
    },

    bindAppEvents: function() {
        EventBus.on('project:list-updated', this.populateProjectSelector.bind(this));
    },

    /**
     * 初始化项目选择器，获取项目列表并填充
     */
    initProjectSelector: async function() {
        this.projectSelector.addEventListener('change', (e) => {
            Config.setActiveProject(e.target.value || null);
        });

        try {
            const projects = await NetworkManager.getProjects();
            Config.setProjectList(projects);
            // 尝试恢复上一次选择的项目
            const lastActive = Config.getLastActiveProject();
            if (lastActive && projects.includes(lastActive)) {
                Config.setActiveProject(lastActive);
            }
        } catch (error) {
            EventBus.emit('log:error', `获取项目列表失败: ${error.message}`);
        }
    },

    /**
     * 使用项目列表填充选择器
     * @param {string[]} projects - 项目名称数组
     */
    populateProjectSelector: function(projects) {
        this.projectSelector.innerHTML = '<option value="">-- 选择项目 --</option>';
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project;
            option.textContent = project;
            this.projectSelector.appendChild(option);
        });

        // 更新选择器的值为当前活动项目
        this.projectSelector.value = Config.currentProject || "";
    },

    /**
     * @description 为一组按钮绑定点击事件监听器。
     * @param {NodeListOf<Element>} buttons - 按钮元素列表。
     */
    bindButtons: function(buttons) {
        buttons.forEach(function(button) {
            button.addEventListener('click', function() {
                const action = button.dataset.action;
                if (action) {
                    // 将UI操作转换为具体的应用事件
                    EventBus.emit(`action:${action}`);
                }
            });
        });
    }
};

export default ToolbarManager;