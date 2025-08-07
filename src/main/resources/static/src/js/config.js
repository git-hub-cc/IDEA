// src/js/config.js - 应用全局配置
import EventBus from './utils/event-emitter.js';

/**
 * @description 全局配置管理器，负责跟踪和广播应用级的状态，如当前活动项目。
 */
const Config = {
    // 跟踪工作区中的所有项目
    projectList: [],
    // 跟踪当前活动的项目
    currentProject: null,

    /**
     * @description 用于在UI上显示项目名称，提供一个默认值。
     * @returns {string} 当前活动项目的名称或默认文本。
     */
    get activeProjectName() {
        return this.currentProject || "无活动项目";
    },

    /**
     * @description 设置项目列表。
     * @param {string[]} projects - 项目名称数组。
     */
    setProjectList: function(projects) {
        this.projectList = projects;
        EventBus.emit('project:list-updated', this.projectList);
    },

    /**
     * @description 设置当前活动的项目，并通知整个应用。
     * @param {string | null} projectName - 新的项目名称，或 null 来关闭项目。
     * @param {boolean} [silent=false] - 如果为 true，则不触发事件。
     */
    setActiveProject: function(projectName, silent = false) {
        if (this.currentProject !== projectName) {
            console.log(`活动项目变更为: ${projectName}`);
            this.currentProject = projectName;

            // 将选择持久化到 localStorage
            if (projectName) {
                localStorage.setItem('lastActiveProject', projectName);
            } else {
                localStorage.removeItem('lastActiveProject');
            }

            if (!silent) {
                // 触发一个全局事件，通知各组件项目已变更
                EventBus.emit('project:activated', projectName);
            }
        }
    },

    /**
     * @description 从 localStorage 获取上次活动的项。
     * @returns {string | null} 上次活动的项目名称。
     */
    getLastActiveProject: function() {
        return localStorage.getItem('lastActiveProject');
    }
};

export default Config;