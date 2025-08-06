// src/js/utils/TemplateLoader.js - A utility for loading and caching HTML templates.

const TemplateLoader = {
    _templateCache: new Map(),
    isInitialized: false,

    /**
     * Fetches the template.html file, parses it, and caches all <template> elements.
     * This should be called once at application startup.
     * @returns {Promise<void>}
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        try {
            const response = await fetch('template.html');
            if (!response.ok) {
                throw new Error(`Failed to fetch templates: ${response.statusText}`);
            }
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const templates = doc.querySelectorAll('template');
            templates.forEach(template => {
                if (template.id) {
                    this._templateCache.set(template.id, template);
                }
            });

            this.isInitialized = true;
            console.log(`TemplateLoader initialized with ${this._templateCache.size} templates.`);
        } catch (error) {
            console.error('Error initializing TemplateLoader:', error);
            // In a real app, you might want to show an error to the user
            // and prevent the app from continuing.
        }
    },

    /**
     * Retrieves a clone of a cached template's content.
     * @param {string} templateId - The ID of the <template> element to retrieve.
     * @returns {DocumentFragment | null} A clone of the template's content, or null if not found.
     */
    get(templateId) {
        if (!this.isInitialized) {
            console.error('TemplateLoader has not been initialized. Call init() first.');
            return null;
        }

        const template = this._templateCache.get(templateId);
        if (template) {
            // Return a clone to ensure the original template in the cache remains pristine.
            return template.content.cloneNode(true);
        }

        console.error(`Template with ID "${templateId}" not found.`);
        return null;
    }
};

export default TemplateLoader;