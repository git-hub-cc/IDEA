// src/js/services/ProjectAnalysisService.js

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from '../managers/NetworkManager.js';

/**
 * 负责获取和缓存项目级的分析数据，如类名列表。
 */
const ProjectAnalysisService = {
    // 使用Map来缓存每个项目的数据，键为项目名，值为 { classNames: [...] }
    projectCache: new Map(),
    isInitialized: false,

    init() {
        if (this.isInitialized) return;
        this.bindAppEvents();
        this.isInitialized = true;
        EventBus.emit('log:info', '项目分析服务已初始化。');
    },

    bindAppEvents() {
        // 当项目被激活时，触发数据获取
        EventBus.on('project:activated', (projectName) => {
            if (projectName) {
                this.fetchAndCacheClassNames(projectName);
            } else {
                // 如果没有活动项目，清空缓存
                this.projectCache.clear();
            }
        });
    },

    /**
     * 从后端获取并缓存指定项目的类名列表。
     * @param {string} projectName - 项目名称。
     */
    async fetchAndCacheClassNames(projectName) {
        if (!projectName) return;

        EventBus.emit('log:info', `正在为项目 '${projectName}' 获取类名列表...`);
        try {
            const classNames = await NetworkManager.getProjectClassNames(projectName);
            this.projectCache.set(projectName, { classNames: classNames || [] });
            EventBus.emit('log:info', `项目 '${projectName}' 的类名已缓存 (${classNames.length} 个)。`);
            // 可以选择性地发出一个事件，通知其他部分数据已更新
            EventBus.emit('analysis:classNamesUpdated', { projectName, classNames });
        } catch (error) {
            EventBus.emit('log:error', `获取项目 '${projectName}' 的类名失败: ${error.message}`);
            // 即使失败，也设置一个空数组，避免后续出错
            this.projectCache.set(projectName, { classNames: [] });
        }
    },

    /**
     * 获取当前活动项目的类名列表。
     * @returns {Array<string>} - 类名字符串数组。
     */
    getClassNames() {
        if (!Config.currentProject) {
            return [];
        }
        const cache = this.projectCache.get(Config.currentProject);
        return cache ? cache.classNames : [];
    }
};

export default ProjectAnalysisService;