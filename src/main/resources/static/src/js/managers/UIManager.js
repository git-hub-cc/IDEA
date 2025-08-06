// src/js/managers/UIManager.js - 负责整体UI布局与面板管理

import EventBus from '../utils/event-emitter.js';
import { ResizableLayout } from '../utils/resizable-layout.js';

const UIManager = {
    mainLayout: null,
    topLayout: null,
    panelTabButtons: null,
    panelContents: null,
    // ========================= 关键优化 START =========================
    busyOverlay: null,
    requestCounter: 0, // 用于处理并发请求
    // ========================= 关键优化 END ===========================

    init: function() {
        this.panelTabButtons = document.querySelectorAll('.panel-tab');
        this.panelContents = document.querySelectorAll('.panel-content');
        // ========================= 关键优化 START =========================
        this.busyOverlay = document.getElementById('busy-overlay');
        // ========================= 关键优化 END ===========================

        this.setupPanelResizing();
        this.setupPanelTabs();
        this.bindEvents();
    },

    bindEvents: function() {
        EventBus.on('ui:layoutChanged', this.handlePanelLayoutChange.bind(this));
        EventBus.on('ui:activateBottomPanelTab', this.activateBottomPanelTab.bind(this));
        // ========================= 关键优化 START =========================
        EventBus.on('network:request-start', this.showBusy.bind(this));
        EventBus.on('network:request-end', this.hideBusy.bind(this));
        // ========================= 关键优化 END ===========================
    },

    // ========================= 关键优化 START =========================
    /**
     * 显示繁忙状态指示器。
     * 使用计数器来处理并发请求，只有第一个请求会显示遮罩。
     */
    showBusy: function() {
        this.requestCounter++;
        if (this.busyOverlay && this.requestCounter === 1) {
            this.busyOverlay.classList.add('visible');
        }
    },

    /**
     * 隐藏繁忙状态指示器。
     * 仅当所有并发请求都完成时才隐藏遮罩。
     */
    hideBusy: function() {
        if (this.requestCounter > 0) {
            this.requestCounter--;
        }

        if (this.busyOverlay && this.requestCounter === 0) {
            this.busyOverlay.classList.remove('visible');
        }
    },
    // ========================= 关键优化 END ===========================

    setupPanelResizing: function() {
        this.mainLayout = new ResizableLayout(
            '#main-panels',
            ['#top-panels-wrapper', '#bottom-panel'],
            {
                direction: 'vertical',
                minSizes: [100, 100],
                initialSizes: [70, 30],
                storageKey: 'web-idea-layout-vertical'
            }
        );
        this.mainLayout.init();

        this.topLayout = new ResizableLayout(
            '#top-panels-wrapper',
            ['#left-panel', '#center-panel'],
            {
                direction: 'horizontal',
                minSizes: [200, 350],
                initialSizes: [25, 75],
                storageKey: 'web-idea-layout-horizontal'
            }
        );
        this.topLayout.init();
    },

    setupPanelTabs: function() {
        this.panelTabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const panelId = button.dataset.panelId;
                EventBus.emit('ui:activateBottomPanelTab', panelId);
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

            EventBus.emit('ui:layoutChanged');
        }
    },

    handlePanelLayoutChange: function() {
        EventBus.emit('editor:resize');
        EventBus.emit('terminal:resize');
    }
};

export default UIManager;