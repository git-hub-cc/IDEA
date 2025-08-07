// src/js/utils/TemplateLoader.js - HTML模板加载与缓存工具

/**
 * @description TemplateLoader 是一个单例对象，用于在应用启动时加载并缓存
 * 来自 template.html 的所有 HTML 模板，以便后续高效复用。
 */
const TemplateLoader = {
    _templateCache: new Map(),
    isInitialized: false,

    /**
     * @description 初始化加载器。
     * 它会获取 template.html 文件，解析其中的所有 <template> 元素，并根据其 ID 进行缓存。
     * 此方法应在应用启动时调用一次。
     * @returns {Promise<void>}
     */
    init: async function() {
        if (this.isInitialized) {
            return;
        }

        try {
            const response = await fetch('template.html');
            if (!response.ok) {
                throw new Error(`获取模板文件失败: ${response.statusText}`);
            }
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const templates = doc.querySelectorAll('template');
            templates.forEach(function(template) {
                if (template.id) {
                    this._templateCache.set(template.id, template);
                }
            }, this);

            this.isInitialized = true;
            console.log(`模板加载器已初始化，共缓存了 ${this._templateCache.size} 个模板。`);
        } catch (error) {
            console.error('模板加载器初始化失败:', error);
            // 在实际应用中，可能需要向用户显示错误并阻止应用继续运行。
        }
    },

    /**
     * @description 根据ID获取一个已缓存模板的内容克隆。
     * @param {string} templateId - 要获取的 <template> 元素的 ID。
     * @returns {DocumentFragment | null} 返回模板内容的克隆，如果未找到则返回 null。
     */
    get: function(templateId) {
        if (!this.isInitialized) {
            console.error('模板加载器尚未初始化，请先调用 init()。');
            return null;
        }

        const template = this._templateCache.get(templateId);
        if (template) {
            // 返回一个克隆体，以确保缓存中的原始模板保持不变。
            return template.content.cloneNode(true);
        }

        console.error(`未找到 ID 为 "${templateId}" 的模板。`);
        return null;
    }
};

export default TemplateLoader;