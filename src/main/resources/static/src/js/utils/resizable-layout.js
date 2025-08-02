// src/js/utils/resizable-layout.js - 自定义可拖拽布局管理器

import EventBus from './event-emitter.js';

export class ResizableLayout {
    constructor(containerSelector, panelSelectors, options = {}) {
        this.container = document.querySelector(containerSelector);
        this.panels = panelSelectors.map(sel => document.querySelector(sel));

        // Options
        this.direction = options.direction || 'horizontal';
        this.minSizes = options.minSizes || [];
        this.initialSizes = options.initialSizes || [];
        this.storageKey = options.storageKey || null;

        this.splitters = [];
        this.activeSplitter = null;

        // Bind event handlers to the instance
        this._onMouseMoveBound = this._onMouseMove.bind(this);
        this._onMouseUpBound = this._onMouseUp.bind(this);
    }

    init() {
        this.container.style.display = 'flex';
        this.container.style.flexDirection = this.direction === 'horizontal' ? 'row' : 'column';

        const loaded = this._loadLayout();
        if (!loaded && this.initialSizes.length === this.panels.length) {
            this.panels.forEach((panel, i) => {
                panel.style.flexBasis = `${this.initialSizes[i]}%`;
            });
        }

        this._createSplitters();
        this._addEventListeners();

        EventBus.emit('ui:layoutChanged');
    }

    _createSplitters() {
        for (let i = 0; i < this.panels.length - 1; i++) {
            const splitter = document.createElement('div');
            splitter.className = `custom-gutter ${this.direction}`;
            splitter.prevPanel = this.panels[i];
            splitter.nextPanel = this.panels[i+1];
            this.container.insertBefore(splitter, this.panels[i+1]);
            this.splitters.push(splitter);
        }
    }

    _addEventListeners() {
        this.splitters.forEach(splitter => {
            splitter.addEventListener('mousedown', (e) => this._onMouseDown(e, splitter));
        });
    }

    _onMouseDown(e, splitter) {
        e.preventDefault();
        this.activeSplitter = splitter;
        document.body.classList.add('is-resizing');
        // ========================= 关键修改 START =========================
        // 动态设置鼠标指针样式，以适应垂直和水平拖动
        document.body.style.cursor = this.direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
        // ========================= 关键修改 END ===========================
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
    }

    _onMouseMove(e) {
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
    }

    _onMouseUp() {
        document.body.classList.remove('is-resizing');
        // ========================= 关键修改 START =========================
        // 恢复默认的鼠标指针
        document.body.style.cursor = '';
        // ========================= 关键修改 END ===========================
        if (this.activeSplitter) {
            this.activeSplitter.classList.remove('is-dragging');
        }
        document.removeEventListener('mousemove', this._onMouseMoveBound);
        document.removeEventListener('mouseup', this._onMouseUpBound);
        this._saveLayout();
        this.activeSplitter = null;
    }

    _saveLayout() {
        if (!this.storageKey) return;
        const layoutState = this.panels.map(panel => panel.style.flexBasis);
        localStorage.setItem(this.storageKey, JSON.stringify(layoutState));
    }

    _loadLayout() {
        if (!this.storageKey) return false;
        const savedBases = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
        if (Array.isArray(savedBases) && savedBases.length === this.panels.length) {
            this.panels.forEach((panel, i) => {
                if (savedBases[i]) panel.style.flexBasis = savedBases[i];
            });
            return true;
        }
        return false;
    }

    resetLayout() {
        if (this.storageKey) localStorage.removeItem(this.storageKey);
        this.init();
    }
}