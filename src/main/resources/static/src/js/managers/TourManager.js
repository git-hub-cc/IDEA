// src/js/managers/TourManager.js - 功能引导管理器

import EventBus from '../utils/event-emitter.js';
import TemplateLoader from '../utils/TemplateLoader.js';

/**
 * @description 管理新用户的功能引导流程。
 * 它负责加载引导步骤，高亮显示UI元素，并展示说明性的弹出框。
 */
const TourManager = {
    steps: [],
    currentStepIndex: -1,
    isActive: false,

    tourOverlay: null,
    tourPopover: null,
    highlightedElement: null,

    /**
     * @description 初始化功能引导管理器。
     */
    init: function() {
        this.loadSteps();
        this.createTourUI();
        this.bindEvents();
    },

    /**
     * @description 从JSON文件异步加载引导步骤。
     */
    loadSteps: async function() {
        try {
            const response = await fetch('src/js/data/tour-steps.json');
            if (!response.ok) {
                throw new Error('加载引导步骤文件失败。');
            }
            this.steps = await response.json();
        } catch (error) {
            console.error('功能引导管理器错误:', error);
        }
    },

    /**
     * @description 创建引导所需的UI元素（遮罩层和弹出框）。
     */
    createTourUI: function() {
        this.tourOverlay = document.createElement('div');
        this.tourOverlay.className = 'tour-overlay';
        document.body.appendChild(this.tourOverlay);

        this.tourPopover = document.createElement('div');
        this.tourPopover.className = 'tour-popover';
        document.body.appendChild(this.tourPopover);
    },

    /**
     * @description 绑定相关事件。
     */
    bindEvents: function() {
        EventBus.on('action:start-tour', () => this.start(true));

        this.tourPopover.addEventListener('click', function(e) {
            if (e.target.dataset.action === 'next') this.nextStep();
            if (e.target.dataset.action === 'prev') this.prevStep();
            if (e.target.dataset.action === 'end') this.end();
        }.bind(this));

        document.addEventListener('keydown', function(e) {
            if (this.isActive && e.key === 'Escape') {
                this.end();
            }
        }.bind(this));
    },

    /**
     * @description 开始功能引导。
     * @param {boolean} [force=false] - 如果为true，则即使用户已完成过引导，也强制开始。
     */
    start: function(force = false) {
        if (this.isActive || this.steps.length === 0) {
            return;
        }

        const tourCompleted = localStorage.getItem('tourCompleted');
        if (tourCompleted && !force) {
            return;
        }

        this.isActive = true;
        this.currentStepIndex = -1;
        this.tourOverlay.classList.add('visible');
        this.nextStep();
        EventBus.emit('log:info', '功能引导已开始。');
    },

    /**
     * @description 结束功能引导。
     */
    end: function() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        this.tourOverlay.classList.remove('visible');
        this.tourPopover.classList.remove('visible');
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tour-highlight');
        }

        localStorage.setItem('tourCompleted', 'true');
        EventBus.emit('log:info', '功能引导已结束。');
    },

    /**
     * @description 显示下一步。
     */
    nextStep: function() {
        if (this.currentStepIndex < this.steps.length - 1) {
            this.currentStepIndex++;
            this.showStep(this.currentStepIndex);
        } else {
            this.end();
        }
    },

    /**
     * @description 显示上一步。
     */
    prevStep: function() {
        if (this.currentStepIndex > 0) {
            this.currentStepIndex--;
            this.showStep(this.currentStepIndex);
        }
    },

    /**
     * @description 显示指定索引的引导步骤。
     * @param {number} index - 步骤的索引。
     */
    showStep: function(index) {
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tour-highlight');
        }

        const step = this.steps[index];
        const element = document.querySelector(step.element);

        if (!element) {
            console.warn(`引导步骤 ${index + 1}: 未找到选择器为 "${step.element}" 的元素。正在跳过。`);
            this.nextStep();
            return;
        }

        this.highlightedElement = element;
        this.highlightedElement.classList.add('tour-highlight');
        this.highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        this.renderPopover(step);
        this.positionPopover(element, step.position);
    },

    /**
     * @description 渲染弹出框的内容。
     * @param {object} step - 当前步骤的数据。
     */
    renderPopover: function(step) {
        const popoverFragment = TemplateLoader.get('tour-popover-template');
        if (!popoverFragment) {
            return;
        }

        popoverFragment.querySelector('h4').textContent = step.title;
        popoverFragment.querySelector('p').textContent = step.content;
        popoverFragment.querySelector('.tour-popover-steps').textContent = `${this.currentStepIndex + 1} / ${this.steps.length}`;

        const navContainer = popoverFragment.querySelector('.tour-popover-nav');
        const isFirstStep = this.currentStepIndex === 0;
        const isLastStep = this.currentStepIndex === this.steps.length - 1;

        if (!isFirstStep) {
            const prevButton = document.createElement('button');
            prevButton.dataset.action = 'prev';
            prevButton.textContent = '上一步';
            navContainer.appendChild(prevButton);
        }

        const endButton = document.createElement('button');
        endButton.dataset.action = 'end';
        endButton.textContent = '结束';
        navContainer.appendChild(endButton);

        const nextButton = document.createElement('button');
        nextButton.dataset.action = 'next';
        nextButton.className = 'primary';
        nextButton.textContent = isLastStep ? '完成' : '下一步';
        navContainer.appendChild(nextButton);

        this.tourPopover.innerHTML = ''; // 清空旧内容
        this.tourPopover.appendChild(popoverFragment);
    },

    /**
     * @description 定位弹出框到目标元素旁边。
     * @param {HTMLElement} targetElement - 高亮的目标元素。
     * @param {string} position - 弹出框的位置 ('top', 'bottom', 'left', 'right')。
     */
    positionPopover: function(targetElement, position) {
        const targetRect = targetElement.getBoundingClientRect();
        const popoverRect = this.tourPopover.getBoundingClientRect();
        const offset = 15;
        let top = 0,
            left = 0;

        switch (position) {
            case 'top':
                top = targetRect.top - popoverRect.height - offset;
                left = targetRect.left + (targetRect.width / 2) - (popoverRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (popoverRect.height / 2);
                left = targetRect.left - popoverRect.width - offset;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (popoverRect.height / 2);
                left = targetRect.right + offset;
                break;
            case 'bottom':
            default:
                top = targetRect.bottom + offset;
                left = targetRect.left + (targetRect.width / 2) - (popoverRect.width / 2);
                break;
        }

        // 边界检测，防止弹出框超出视窗
        if (left < 0) left = offset;
        if (left + popoverRect.width > window.innerWidth) left = window.innerWidth - popoverRect.width - offset;
        if (top < 0) top = offset;
        if (top + popoverRect.height > window.innerHeight) top = window.innerHeight - popoverRect.height - offset;

        this.tourPopover.style.top = `${top}px`;
        this.tourPopover.style.left = `${left}px`;
        this.tourPopover.classList.add('visible');
    }
};

export default TourManager;