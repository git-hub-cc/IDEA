// src/js/utils/resizable-layout.js - 自定义可拖拽布局管理器

import EventBus from './event-emitter.js';

/**
 * @class ResizableLayout
 * @description 一个用于创建可拖拽调整大小的面板布局的工具类。
 * @param {string} containerSelector - 布局容器的CSS选择器。
 * @param {string[]} panelSelectors - 面板元素的CSS选择器数组。
 * @param {object} [options={}] - 配置选项。
 * @param {string} [options.direction='horizontal'] - 布局方向 ('horizontal' 或 'vertical')。
 * @param {number[]} [options.minSizes=[]] - 面板的最小尺寸数组 (单位: px)。
 * @param {number[]} [options.initialSizes=[]] - 面板的初始尺寸数组 (单位: %)。
 * @param {string} [options.storageKey=null] - 用于在localStorage中保存布局状态的键。
 */
export function ResizableLayout(containerSelector, panelSelectors, options = {}) {
    this.container = document.querySelector(containerSelector);
    this.panels = panelSelectors.map(function(sel) {
        return document.querySelector(sel);
    });

    this.direction = options.direction || 'horizontal';
    this.minSizes = options.minSizes || [];
    this.initialSizes = options.initialSizes || [];
    this.storageKey = options.storageKey || null;

    this.splitters = [];
    this.activeSplitter = null;

    // 将事件处理器绑定到实例，以确保 `this` 的正确指向
    this._onMouseMoveBound = this._onMouseMove.bind(this);
    this._onMouseUpBound = this._onMouseUp.bind(this);
}

/**
 * @description 初始化布局，创建分隔条并应用保存的状态。
 */
ResizableLayout.prototype.init = function() {
    this.container.style.display = 'flex';
    this.container.style.flexDirection = this.direction === 'horizontal' ? 'row' : 'column';

    const loaded = this._loadLayout();
    if (!loaded && this.initialSizes.length === this.panels.length) {
        this.panels.forEach(function(panel, i) {
            panel.style.flexBasis = `${this.initialSizes[i]}%`;
        }, this);
    }

    this._createSplitters();
    this._addEventListeners();

    EventBus.emit('ui:layoutChanged');
};

/**
 * @description 创建分隔条元素并插入到面板之间。
 * @private
 */
ResizableLayout.prototype._createSplitters = function() {
    for (let i = 0; i < this.panels.length - 1; i++) {
        const splitter = document.createElement('div');
        splitter.className = `custom-gutter ${this.direction}`;
        splitter.prevPanel = this.panels[i];
        splitter.nextPanel = this.panels[i + 1];
        this.container.insertBefore(splitter, this.panels[i + 1]);
        this.splitters.push(splitter);
    }
};

/**
 * @description 为所有分隔条添加 mousedown 事件监听器。
 * @private
 */
ResizableLayout.prototype._addEventListeners = function() {
    this.splitters.forEach(function(splitter) {
        splitter.addEventListener('mousedown', function(e) {
            this._onMouseDown(e, splitter);
        }.bind(this));
    }, this);
};

/**
 * @description 处理分隔条上的 mousedown 事件。
 * @param {MouseEvent} e - 鼠标事件对象。
 * @param {HTMLElement} splitter - 被点击的分隔条。
 * @private
 */
ResizableLayout.prototype._onMouseDown = function(e, splitter) {
    e.preventDefault();
    this.activeSplitter = splitter;
    document.body.classList.add('is-resizing');
    document.body.style.cursor = this.direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
    splitter.classList.add('is-dragging');

    const rectPrev = splitter.prevPanel.getBoundingClientRect();
    const rectNext = splitter.nextPanel.getBoundingClientRect();

    if (this.direction === 'horizontal') {
        this.initialMousePosition = e.clientX;
        this.initialPrevSize = rectPrev.width;
        this.initialNextSize = rectNext.width;
    } else {
        this.initialMousePosition = e.clientY;
        this.initialPrevSize = rectPrev.height;
        this.initialNextSize = rectNext.height;
    }

    document.addEventListener('mousemove', this._onMouseMoveBound);
    document.addEventListener('mouseup', this._onMouseUpBound);
};

/**
 * @description 处理 document 上的 mousemove 事件，动态调整面板大小。
 * @param {MouseEvent} e - 鼠标事件对象。
 * @private
 */
ResizableLayout.prototype._onMouseMove = function(e) {
    e.preventDefault();
    let delta = (this.direction === 'horizontal' ? e.clientX : e.clientY) - this.initialMousePosition;

    let newPrevSize = this.initialPrevSize + delta;
    let newNextSize = this.initialNextSize - delta;

    const prevPanelIndex = this.panels.indexOf(this.activeSplitter.prevPanel);
    const nextPanelIndex = this.panels.indexOf(this.activeSplitter.nextPanel);

    const minPrev = this.minSizes[prevPanelIndex] || 0;
    const minNext = this.minSizes[nextPanelIndex] || 0;

    if (newPrevSize < minPrev) {
        delta = minPrev - this.initialPrevSize;
        newPrevSize = minPrev;
        newNextSize = this.initialNextSize - delta;
    }
    if (newNextSize < minNext) {
        delta = this.initialNextSize - minNext;
        newPrevSize = this.initialPrevSize + delta;
        newNextSize = minNext;
    }

    this.activeSplitter.prevPanel.style.flexBasis = `${newPrevSize}px`;
    this.activeSplitter.nextPanel.style.flexBasis = `${newNextSize}px`;

    EventBus.emit('ui:layoutChanged');
};

/**
 * @description 处理 document 上的 mouseup 事件，结束拖拽。
 * @private
 */
ResizableLayout.prototype._onMouseUp = function() {
    document.body.classList.remove('is-resizing');
    document.body.style.cursor = '';
    if (this.activeSplitter) {
        this.activeSplitter.classList.remove('is-dragging');
    }

    document.removeEventListener('mousemove', this._onMouseMoveBound);
    document.removeEventListener('mouseup', this._onMouseUpBound);

    this._saveLayout();
    this.activeSplitter = null;
};

/**
 * @description 将当前布局状态保存到 localStorage。
 * @private
 */
ResizableLayout.prototype._saveLayout = function() {
    if (!this.storageKey) return;
    const layoutState = this.panels.map(function(panel) {
        return panel.style.flexBasis;
    });
    localStorage.setItem(this.storageKey, JSON.stringify(layoutState));
};

/**
 * @description 从 localStorage 加载并应用布局状态。
 * @returns {boolean} 如果成功加载则返回 true，否则返回 false。
 * @private
 */
ResizableLayout.prototype._loadLayout = function() {
    if (!this.storageKey) return false;
    const savedBases = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
    if (Array.isArray(savedBases) && savedBases.length === this.panels.length) {
        this.panels.forEach(function(panel, i) {
            if (savedBases[i]) panel.style.flexBasis = savedBases[i];
        });
        return true;
    }
    return false;
};

/**
 * @description 重置布局到初始状态。
 */
ResizableLayout.prototype.resetLayout = function() {
    if (this.storageKey) {
        localStorage.removeItem(this.storageKey);
    }
    this.init();
};