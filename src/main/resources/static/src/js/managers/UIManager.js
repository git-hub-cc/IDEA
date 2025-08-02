// src/js/managers/UIManager.js - 负责整体UI布局与面板管理

import EventBus from '../utils/event-emitter.js';
import { ResizableLayout } from '../utils/resizable-layout.js';

const UIManager = {
    // ========================= 关键修改 START =========================
    // 从单个布局管理器改为两个，以支持嵌套布局
    mainLayout: null,
    topLayout: null,
    // ========================= 关键修改 END ===========================
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

    // ========================= 关键修改 START =========================
    // 重写此方法以创建垂直和水平两个布局，修复错误
    setupPanelResizing: function() {
        // 主垂直布局：将屏幕分为上下两部分（顶部面板区和底部面板）
        this.mainLayout = new ResizableLayout(
            '#main-panels',
            ['#top-panels-wrapper', '#bottom-panel'],
            {
                direction: 'vertical',
                minSizes: [100, 100], // 顶部区域最小高度100px, 底部面板最小高度100px
                initialSizes: [70, 30],
                storageKey: 'web-idea-layout-vertical'
            }
        );
        this.mainLayout.init();

        // 嵌套的水平布局：将顶部区域分为左右两部分（文件树和编辑器）
        this.topLayout = new ResizableLayout(
            '#top-panels-wrapper',
            ['#left-panel', '#center-panel'],
            {
                direction: 'horizontal',
                minSizes: [200, 350], // 保持原始的最小宽度设置
                initialSizes: [25, 75],
                storageKey: 'web-idea-layout-horizontal'
            }
        );
        this.topLayout.init();
    },
    // ========================= 关键修改 END ===========================

    setupPanelTabs: function() {
        this.panelTabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const panelId = button.dataset.panelId;
                // 通过发出全局事件来处理Tab切换，实现模块解耦。
                // UIManager自身和TerminalManager等其他模块都会监听到这个事件。
                EventBus.emit('ui:activateBottomPanelTab', panelId);
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
        // 使用事件驱动的方法通知其他模块，而不是直接调用它们。
        EventBus.emit('editor:resize');
        EventBus.emit('terminal:resize');
    }
};

export default UIManager;