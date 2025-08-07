// src/js/services/ProjectAnalysisService.js - 项目分析服务

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from '../managers/NetworkManager.js';

/**
 * @description 负责获取和缓存项目级的分析数据，如Java类名列表和语法问题。
 * 它通过防抖机制来避免在用户频繁保存文件时过度请求后端。
 */
const ProjectAnalysisService = {
    projectCache: new Map(),
    isInitialized: false,
    analysisDebounce: null,

    /**
     * @description 初始化项目分析服务。
     */
    init: function() {
        if (this.isInitialized) return;

        this.analysisDebounce = this._debounce(function(projectName) {
            this.fetchAndCacheAnalysisData(projectName);
        }.bind(this), 500);

        this.bindAppEvents();
        this.isInitialized = true;
        EventBus.emit('log:info', '项目分析服务已初始化。');
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        EventBus.on('project:activated', (projectName) => {
            if (projectName) {
                this.analysisDebounce(projectName);
            } else {
                this.projectCache.clear();
                EventBus.emit('analysis:problems-updated', []);
            }
        });

        EventBus.on('file:saved', (filePath) => {
            if (Config.currentProject && filePath.endsWith('.java')) {
                this.analysisDebounce(Config.currentProject);
            }
        });
    },

    /**
     * @description 从后端获取项目分析数据（类名和问题）并缓存。
     * @param {string} projectName - 要分析的项目名称。
     */
    fetchAndCacheAnalysisData: async function(projectName) {
        if (!projectName) return;

        EventBus.emit('statusbar:updateStatus', `正在分析 ${projectName}...`);
        try {
            const analysisResult = await NetworkManager.getProjectClassNames(projectName);
            const classNames = analysisResult.classNames || [];
            const errors = analysisResult.errors || [];

            this.projectCache.set(projectName, { classNames: classNames });
            EventBus.emit('log:info', `项目 '${projectName}' 的类名已缓存 (${classNames.length} 个)。`);

            EventBus.emit('analysis:problems-updated', errors);
            if (errors.length > 0) {
                EventBus.emit('log:warn', `在 '${projectName}' 中检测到 ${errors.length} 个语法问题。`);
            } else {
                EventBus.emit('log:info', `在 '${projectName}' 中未检测到语法问题。`);
            }

            EventBus.emit('analysis:classNamesUpdated', { projectName: projectName, classNames: classNames });
            EventBus.emit('statusbar:updateStatus', '分析完成', 2000);
        } catch (error) {
            EventBus.emit('log:error', `获取项目 '${projectName}' 的分析数据失败: ${error.message}`);
            this.projectCache.set(projectName, { classNames: [] });
            EventBus.emit('analysis:problems-updated', []);
            EventBus.emit('statusbar:updateStatus', '分析失败', 2000);
        }
    },

    /**
     * @description 获取当前项目的缓存类名列表。
     * @returns {string[]} 类名数组。
     */
    getClassNames: function() {
        if (!Config.currentProject) {
            return [];
        }
        const cache = this.projectCache.get(Config.currentProject);
        return cache ? cache.classNames : [];
    },

    /**
     * @description 一个简单的防抖函数实现。
     * @param {Function} func - 要防抖的函数。
     * @param {number} wait - 延迟毫秒数。
     * @returns {Function} 防抖后的函数。
     * @private
     */
    _debounce: function(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
};

export default ProjectAnalysisService;