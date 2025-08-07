// src/js/managers/UIManager.js - 负责整体UI布局与面板管理

import EventBus from '../utils/event-emitter.js';
import { ResizableLayout } from '../utils/resizable-layout.js';

/**
 * @description UI管理器，负责应用的整体布局（可拖拽面板）、
 * 底部面板的标签页切换，以及全局的“繁忙”状态指示器。
 */
const UIManager = {
    mainLayout: null,
    topLayout: null,
    panelTabButtons: null,
    panelContents: null,
    busyOverlay: null,
    requestCounter: 0, // 用于处理并发的网络请求

    /**
     * @description 初始化UI管理器。
     */
    init: function() {
        this.panelTabButtons = document.querySelectorAll('.panel-tab');
        this.panelContents = document.querySelectorAll('.panel-content');
        this.busyOverlay = document.getElementById('busy-overlay');

        this.setupPanelResizing();
        this.setupPanelTabs();
        this.bindEvents();
    },

    /**
     * @description 绑定应用事件。
     */
    bindEvents: function() {
        EventBus.on('ui:layoutChanged', this.handlePanelLayoutChange.bind(this));
        EventBus.on('ui:activateBottomPanelTab', this.activateBottomPanelTab.bind(this));
        EventBus.on('network:request-start', this.showBusy.bind(this));
        EventBus.on('network:request-end', this.hideBusy.bind(this));
    },

    /**
     * @description 显示繁忙状态指示器（等待光标和遮罩层）。
     * 使用计数器来处理并发请求，只有第一个请求会显示遮罩。
     */
    showBusy: function() {
        this.requestCounter++;
        if (this.busyOverlay && this.requestCounter === 1) {
            this.busyOverlay.classList.add('visible');
        }
    },

    /**
     * @description 隐藏繁忙状态指示器。
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

    /**
     * @description 设置主界面的可拖拽面板布局。
     */
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

    /**
     * @description 为底部面板的标签页按钮设置点击事件。
     */
    setupPanelTabs: function() {
        this.panelTabButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                const panelId = button.dataset.panelId;
                EventBus.emit('ui:activateBottomPanelTab', panelId);
            });
        });
    },

    /**
     * @description 激活指定的底部面板标签页。
     * @param {string} panelId - 要激活的面板的ID。
     */
    activateBottomPanelTab: function(panelId) {
        const targetButton = document.querySelector(`.panel-tab[data-panel-id="${panelId}"]`);
        if (targetButton && !targetButton.classList.contains('active')) {
            this.panelTabButtons.forEach(btn => btn.classList.remove('active'));
            this.panelContents.forEach(content => content.classList.remove('active'));

            targetButton.classList.add('active');
            const panelElement = document.getElementById(panelId);
            if (panelElement) {
                panelElement.classList.add('active');
            }

            EventBus.emit('ui:layoutChanged');
        }
    },

    /**
     * @description 当面板布局改变时，触发相关组件的重绘事件。
     */
    handlePanelLayoutChange: function() {
        EventBus.emit('editor:resize');
        EventBus.emit('terminal:resize');
    }
};

export default UIManager;