// src/js/services/ProjectAnalysisService.js

import EventBus from '../utils/event-emitter.js';
import Config from '../config.js';
import NetworkManager from '../managers/NetworkManager.js';

/**
 * 负责获取和缓存项目级的分析数据，如类名列表，并报告错误。
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
                // 如果没有活动项目，清空缓存和问题面板
                this.projectCache.clear();
                EventBus.emit('analysis:problems-updated', []);
            }
        });

        // ========================= 关键修改 START: 增加对文件保存的监听 =========================
        // 当文件保存后，重新触发分析以更新错误列表
        EventBus.on('file:saved', (filePath) => {
            // 确保是Java文件且有活动项目
            if (Config.currentProject && filePath.endsWith('.java')) {
                this.fetchAndCacheClassNames(Config.currentProject);
            }
        });
        // ========================= 关键修改 END ==========================================
    },

    /**
     * 从后端获取并缓存指定项目的类名列表，并广播错误。
     * @param {string} projectName - 项目名称。
     */
    async fetchAndCacheClassNames(projectName) {
        if (!projectName) return;

        EventBus.emit('log:info', `正在为项目 '${projectName}' 获取分析数据...`);
        try {
            // NetworkManager.getProjectClassNames 现在返回 { classNames, errors }
            const analysisResult = await NetworkManager.getProjectClassNames(projectName);
            const classNames = analysisResult.classNames || [];
            const errors = analysisResult.errors || [];

            // 缓存类名
            this.projectCache.set(projectName, { classNames });
            EventBus.emit('log:info', `项目 '${projectName}' 的类名已缓存 (${classNames.length} 个)。`);

            // ========================= 关键修改 START: 广播错误 =========================
            // 广播错误列表给 ProblemsManager
            EventBus.emit('analysis:problems-updated', errors);
            if (errors.length > 0) {
                EventBus.emit('log:warn', `在 '${projectName}' 中检测到 ${errors.length} 个语法问题。`);
            }
            // ========================= 关键修改 END ===================================

            // 通知代码补全服务数据已更新
            EventBus.emit('analysis:classNamesUpdated', { projectName, classNames });
        } catch (error) {
            EventBus.emit('log:error', `获取项目 '${projectName}' 的分析数据失败: ${error.message}`);
            this.projectCache.set(projectName, { classNames: [] });
            EventBus.emit('analysis:problems-updated', []);
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