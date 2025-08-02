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
        // 监听其他模块发出的激活面板的请求
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

                // ========================= 关键修正 START =========================
                // 不要直接调用方法，而是发出一个全局事件。
                // 这样 UIManager 自己会监听到，TerminalManager 也会监听到。
                EventBus.emit('ui:activateBottomPanelTab', panelId);
                // ========================= 关键修正 END ===========================
            });
        });
    },

    activateBottomPanelTab: function(panelId) {
        const targetButton = document.querySelector(`.panel-tab[data-panel-id="${panelId}"]`);
        // 确保目标按钮存在且当前不是激活状态，避免不必要的重渲染
        if (targetButton && !targetButton.classList.contains('active')) {
            // 切换UI显示
            this.panelTabButtons.forEach(btn => btn.classList.remove('active'));
            this.panelContents.forEach(content => content.classList.remove('active'));

            targetButton.classList.add('active');
            const panelElement = document.getElementById(panelId);
            if(panelElement) panelElement.classList.add('active');

            // 触发布局变化事件，通知内部组件（如编辑器、终端）调整大小
            EventBus.emit('ui:layoutChanged');
        }
    },

    handlePanelLayoutChange: function() {
        // 使用事件驱动的方法通知其他模块，而不是直接调用它们
        EventBus.emit('editor:resize');
        EventBus.emit('terminal:resize');
    }
};

export default UIManager;