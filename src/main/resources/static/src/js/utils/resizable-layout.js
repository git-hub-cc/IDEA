// src/js/utils/resizable-layout.js - 自定义可拖拽布局管理器
export class ResizableLayout {
    constructor(containerSelector, panelSelectors, eventBus, options = {}) {
        this.container = document.querySelector(containerSelector);
        this.panels = panelSelectors.map(sel => document.querySelector(sel));
        this.eventBus = eventBus;

        this.direction = options.direction || 'horizontal'; // 'horizontal' or 'vertical'
        this.minSizes = options.minSizes || []; // Array of min sizes in pixels
        this.initialSizes = options.initialSizes || []; // Array of initial sizes in percentages (if no saved layout)
        this.storageKey = options.storageKey || null; // Key for localStorage persistence

        this.splitters = [];
        this.activeSplitter = null;
        this.prevPanel = null;
        this.nextPanel = null;
        this.initialMousePosition = 0;
        this.initialPrevSize = 0;
        this.initialNextSize = 0;

        // Bind event handlers to the instance
        this._onMouseMoveBound = this._onMouseMove.bind(this);
        this._onMouseUpBound = this._onMouseUp.bind(this);
    }

    init() {
        // Set up container as a flex container
        this.container.style.display = 'flex';
        this.container.style.flexDirection = this.direction === 'horizontal' ? 'row' : 'column';

        const loaded = this._loadLayout(); // Try to load saved layout
        if (!loaded && this.initialSizes.length === this.panels.length) {
            // If no saved layout, apply initial percentage sizes
            this.panels.forEach((panel, i) => {
                panel.style.flexGrow = '0';
                panel.style.flexShrink = '0';
                panel.style.flexBasis = `${this.initialSizes[i]}%`;
            });
        }

        this._createSplitters();
        this._addEventListeners();

        // Notify components like Monaco/Xterm that layout might have changed on load
        this.eventBus.emit('layoutChanged');
    }

    _createSplitters() {
        for (let i = 0; i < this.panels.length - 1; i++) {
            const prevPanel = this.panels[i];
            const nextPanel = this.panels[i + 1];

            const splitter = document.createElement('div');
            splitter.classList.add('custom-gutter', this.direction); // Add direction class for CSS

            // Store references to the panels it separates
            splitter.prevPanel = prevPanel;
            splitter.nextPanel = nextPanel;

            // Insert the splitter into the DOM
            this.container.insertBefore(splitter, nextPanel);
            this.splitters.push(splitter);
        }
    }

    _addEventListeners() {
        this.splitters.forEach(splitter => {
            splitter.addEventListener('mousedown', (e) => this._onMouseDown(e, splitter));
        });
    }

    _onMouseDown(e, splitter) {
        e.preventDefault(); // Prevent text selection

        this.activeSplitter = splitter;
        this.prevPanel = splitter.prevPanel;
        this.nextPanel = splitter.nextPanel;

        document.body.classList.add('is-resizing');
        splitter.classList.add('is-dragging');

        if (this.direction === 'horizontal') {
            this.initialMousePosition = e.clientX;
            this.initialPrevSize = this.prevPanel.getBoundingClientRect().width;
            this.initialNextSize = this.nextPanel.getBoundingClientRect().width;
        } else { // vertical
            this.initialMousePosition = e.clientY;
            this.initialPrevSize = this.prevPanel.getBoundingClientRect().height;
            this.initialNextSize = this.nextPanel.getBoundingClientRect().height;
        }

        document.addEventListener('mousemove', this._onMouseMoveBound);
        document.addEventListener('mouseup', this._onMouseUpBound);
    }

    _onMouseMove(e) {
        e.preventDefault();

        let delta;
        if (this.direction === 'horizontal') {
            delta = e.clientX - this.initialMousePosition;
        } else { // vertical
            delta = e.clientY - this.initialMousePosition;
        }

        let newPrevSize = this.initialPrevSize + delta;
        let newNextSize = this.initialNextSize - delta;

        // Apply minSize constraints
        const prevPanelIndex = this.panels.indexOf(this.prevPanel);
        const nextPanelIndex = this.panels.indexOf(this.nextPanel);

        const minPrev = this.minSizes[prevPanelIndex] !== undefined ? this.minSizes[prevPanelIndex] : 0;
        const minNext = this.minSizes[nextPanelIndex] !== undefined ? this.minSizes[nextPanelIndex] : 0;

        if (newPrevSize < minPrev) {
            newPrevSize = minPrev;
            newNextSize = this.initialPrevSize + this.initialNextSize - minPrev;
        }
        if (newNextSize < minNext) {
            newNextSize = minNext;
            newPrevSize = this.initialPrevSize + this.initialNextSize - minNext;
        }

        // Ensure new sizes are not negative (can happen with aggressive minSize and small total size)
        newPrevSize = Math.max(0, newPrevSize);
        newNextSize = Math.max(0, newNextSize);

        // Apply flex styles
        this.prevPanel.style.flexGrow = '0';
        this.prevPanel.style.flexShrink = '0';
        this.prevPanel.style.flexBasis = `${newPrevSize}px`;

        this.nextPanel.style.flexGrow = '0';
        this.nextPanel.style.flexShrink = '0';
        this.nextPanel.style.flexBasis = `${newNextSize}px`;

        this.eventBus.emit('layoutChanged'); // Notify other components
    }

    _onMouseUp() {
        document.body.classList.remove('is-resizing');
        if (this.activeSplitter) {
            this.activeSplitter.classList.remove('is-dragging');
        }

        document.removeEventListener('mousemove', this._onMouseMoveBound);
        document.removeEventListener('mouseup', this._onMouseUpBound);

        this._saveLayout(); // Save current layout

        this.activeSplitter = null;
        this.prevPanel = null;
        this.nextPanel = null;
    }

    _saveLayout() {
        if (!this.storageKey) return;

        const layoutState = {};
        this.panels.forEach(panel => {
            layoutState[panel.id] = this.direction === 'horizontal' ? panel.getBoundingClientRect().width : panel.getBoundingClientRect().height;
        });
        localStorage.setItem(this.storageKey, JSON.stringify(layoutState));
    }

    _loadLayout() {
        if (!this.storageKey) return false;

        const savedLayout = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        let loadedAny = false;
        this.panels.forEach(panel => {
            if (savedLayout[panel.id]) {
                panel.style.flexGrow = '0';
                panel.style.flexShrink = '0';
                panel.style.flexBasis = `${savedLayout[panel.id]}px`;
                loadedAny = true;
            }
        });
        return loadedAny;
    }

    resetLayout() {
        if (this.storageKey) {
            localStorage.removeItem(this.storageKey);
        }
        this.panels.forEach(panel => {
            panel.style.removeProperty('flex-basis');
            panel.style.removeProperty('flex-grow');
            panel.style.removeProperty('flex-shrink');
        });
        // Re-initialize to apply default percentages
        this.init();
    }
}