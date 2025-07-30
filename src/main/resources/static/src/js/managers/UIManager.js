// src/js/managers/UIManager.js - 负责整体UI布局与面板管理

import EventBus from '../utils/event-emitter.js';
import { ResizableLayout } from '../utils/resizable-layout.js';

const UIManager = {
    horizontalLayout: null,
    panelTabButtons: null,
    panelContents: null,

    init: function() {
        this.panelTabButtons = document.querySelectorAll('.panel-tab');
        this.panelContents = document.querySelectorAll('.panel-content');

        this.setupPanelResizing();
        this.setupPanelTabs();
        this.bindEvents();
    },

    bindEvents: function() {
        EventBus.on('ui:layoutChanged', this.handlePanelLayoutChange.bind(this));
        // Listen for requests to activate a specific panel
        EventBus.on('ui:activateBottomPanelTab', this.activateBottomPanelTab.bind(this));
    },

    setupPanelResizing: function() {
        this.horizontalLayout = new ResizableLayout(
            '#main-panels',
            ['#left-panel', '#center-panel', '#bottom-panel'],
            {
                direction: 'horizontal',
                minSizes: [200, 350, 250],
                initialSizes: [20, 55, 25],
                storageKey: 'web-idea-layout-h'
            }
        );
        this.horizontalLayout.init();
    },

    setupPanelTabs: function() {
        this.panelTabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const panelId = button.dataset.panelId;
                this.activateBottomPanelTab(panelId);
            });
        });
    },

    activateBottomPanelTab: function(panelId) {
        const targetButton = document.querySelector(`.panel-tab[data-panel-id="${panelId}"]`);
        if (targetButton && !targetButton.classList.contains('active')) {
            this.panelTabButtons.forEach(btn => btn.classList.remove('active'));
            this.panelContents.forEach(content => content.classList.remove('active'));

            targetButton.classList.add('active');
            const panelElement = document.getElementById(panelId);
            if(panelElement) panelElement.classList.add('active');

            // Trigger layout change for components inside the new active panel
            EventBus.emit('ui:layoutChanged');
        }
    },

    handlePanelLayoutChange: function() {
        // Use event-driven approach instead of direct calls
        EventBus.emit('editor:resize');
        EventBus.emit('terminal:resize');
    }
};

export default UIManager;