// ui-manager.js - 负责整体UI布局与面板管理
import { ResizableLayout } from './utils/resizable-layout.js';

export class UIManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.mainPanels = document.getElementById('main-panels');
        this.leftPanel = document.getElementById('left-panel');
        this.centerPanel = document.getElementById('center-panel');
        this.bottomPanel = document.getElementById('bottom-panel');
        this.panelTabButtons = document.querySelectorAll('.panel-tab');
        this.panelContents = document.querySelectorAll('.panel-content');

        this.horizontalLayout = null; // Will store the ResizableLayout instance

        // Listen for layout changes to update internal components
        this.eventBus.on('layoutChanged', this.handlePanelLayoutChange.bind(this));
    }

    init() {
        this.setupPanelResizing();
        this.setupPanelTabs();
        // Monaco and Xterm initialization are handled asynchronously in their respective modules.
    }

    // 设置面板拖拽调整大小
    setupPanelResizing() {
        // Initialize the custom ResizableLayout for horizontal panels
        this.horizontalLayout = new ResizableLayout(
            '#main-panels', // Container for the panels
            ['#left-panel', '#center-panel', '#bottom-panel'], // IDs of the panels to resize
            this.eventBus, // Pass eventBus for layoutChanged events
            {
                direction: 'horizontal',
                minSizes: [200, 350, 250], // Minimum sizes for left, center, bottom panels (in pixels)
                initialSizes: [20, 55, 25], // Initial sizes in percentage if no saved layout
                storageKey: 'web-idea-layout-h' // Key for localStorage persistence
            }
        );
        this.horizontalLayout.init(); // Initialize the layout manager
    }

    // 处理面板布局变化，通知相关组件更新自身布局
    handlePanelLayoutChange() {
        // Monaco Editor needs to be notified to update its layout when its parent container changes size
        if (window.monacoEditorInstance) {
            // A slight delay can help ensure the DOM has settled before Monaco calculates its new layout
            setTimeout(() => window.monacoEditorInstance.layout(), 50);
        }
        // If there's an xterm.js instance, it also needs to fit its container
        if (window.xtermInstance && window.xtermFitAddon) {
            setTimeout(() => window.xtermFitAddon.fit(), 50);
        }
    }

    // 设置底部面板的Tab切换
    setupPanelTabs() {
        this.panelTabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const panelId = button.dataset.panelId;

                // 移除所有tab的active类，并隐藏所有内容面板
                this.panelTabButtons.forEach(btn => btn.classList.remove('active'));
                this.panelContents.forEach(content => content.classList.remove('active'));

                // 激活当前点击的tab和对应的内容面板
                button.classList.add('active');
                document.getElementById(panelId).classList.add('active');

                // 切换面板时可能改变可见区域，通知Monaco和Xterm
                this.handlePanelLayoutChange();
            });
        });
    }

    // 激活指定ID的底部面板tab
    activateBottomPanelTab(panelId) {
        const targetButton = document.querySelector(`.panel-tab[data-panel-id="${panelId}"]`);
        if (targetButton && !targetButton.classList.contains('active')) {
            targetButton.click(); // 模拟点击按钮来激活
        }
    }
}