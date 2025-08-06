// src/js/services/ProjectAnalysisService.js

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from '../managers/NetworkManager.js';

/**
 * 负责获取和缓存项目级的分析数据，如类名列表，并报告错误。
 */
const ProjectAnalysisService = {
    projectCache: new Map(),
    isInitialized: false,
    analysisDebounce: null,

    init() {
        if (this.isInitialized) return;

        // 创建一个防抖函数，延迟500ms执行分析
        this.analysisDebounce = this._debounce((projectName) => {
            this.fetchAndCacheClassNames(projectName);
        }, 500);

        this.bindAppEvents();
        this.isInitialized = true;
        EventBus.emit('log:info', '项目分析服务已初始化。');
    },

    bindAppEvents() {
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

    async fetchAndCacheClassNames(projectName) {
        if (!projectName) return;

        EventBus.emit('statusbar:updateStatus', `正在分析 ${projectName}...`);
        try {
            const analysisResult = await NetworkManager.getProjectClassNames(projectName);
            const classNames = analysisResult.classNames || [];
            const errors = analysisResult.errors || [];

            this.projectCache.set(projectName, { classNames });
            EventBus.emit('log:info', `项目 '${projectName}' 的类名已缓存 (${classNames.length} 个)。`);

            EventBus.emit('analysis:problems-updated', errors);
            if (errors.length > 0) {
                EventBus.emit('log:warn', `在 '${projectName}' 中检测到 ${errors.length} 个语法问题。`);
            } else {
                EventBus.emit('log:info', `在 '${projectName}' 中未检测到语法问题。`);
            }

            EventBus.emit('analysis:classNamesUpdated', { projectName, classNames });
            EventBus.emit('statusbar:updateStatus', '分析完成', 2000);
        } catch (error) {
            EventBus.emit('log:error', `获取项目 '${projectName}' 的分析数据失败: ${error.message}`);
            this.projectCache.set(projectName, { classNames: [] });
            EventBus.emit('analysis:problems-updated', []);
            EventBus.emit('statusbar:updateStatus', '分析失败', 2000);
        }
    },

    getClassNames() {
        if (!Config.currentProject) {
            return [];
        }
        const cache = this.projectCache.get(Config.currentProject);
        return cache ? cache.classNames : [];
    },

    _debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
};

export default ProjectAnalysisService;