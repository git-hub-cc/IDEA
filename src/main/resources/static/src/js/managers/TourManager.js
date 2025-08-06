// src/js/managers/TourManager.js
import EventBus from '../utils/event-emitter.js';

const TourManager = {
    steps: [],
    currentStepIndex: -1,
    isActive: false,

    tourOverlay: null,
    tourPopover: null,
    highlightedElement: null,

    init() {
        this.loadSteps();
        this.createTourUI();
        this.bindEvents();
    },

    async loadSteps() {
        try {
            const response = await fetch('src/js/data/tour-steps.json');
            if (!response.ok) throw new Error('Failed to load tour steps.');
            this.steps = await response.json();
        } catch (error) {
            console.error('TourManager Error:', error);
        }
    },

    createTourUI() {
        this.tourOverlay = document.createElement('div');
        this.tourOverlay.className = 'tour-overlay';
        document.body.appendChild(this.tourOverlay);

        this.tourPopover = document.createElement('div');
        this.tourPopover.className = 'tour-popover';
        document.body.appendChild(this.tourPopover);
    },

    bindEvents() {
        EventBus.on('action:start-tour', () => this.start(true));

        // Listen to popover button clicks
        this.tourPopover.addEventListener('click', (e) => {
            if (e.target.dataset.action === 'next') this.nextStep();
            if (e.target.dataset.action === 'prev') this.prevStep();
            if (e.target.dataset.action === 'end') this.end();
        });

        // Also end tour on Esc key
        document.addEventListener('keydown', (e) => {
            if (this.isActive && e.key === 'Escape') {
                this.end();
            }
        });
    },

    start(force = false) {
        if (this.isActive || this.steps.length === 0) return;

        const tourCompleted = localStorage.getItem('tourCompleted');
        if (tourCompleted && !force) {
            return; // Don't start if already completed, unless forced
        }

        this.isActive = true;
        this.currentStepIndex = -1; // Start from the beginning
        this.tourOverlay.classList.add('visible');
        this.nextStep();
        EventBus.emit('log:info', '功能引导已开始。');
    },

    end() {
        if (!this.isActive) return;

        this.isActive = false;
        this.tourOverlay.classList.remove('visible');
        this.tourPopover.classList.remove('visible');
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tour-highlight');
        }

        localStorage.setItem('tourCompleted', 'true');
        EventBus.emit('log:info', '功能引导已结束。');
    },

    nextStep() {
        if (this.currentStepIndex < this.steps.length - 1) {
            this.currentStepIndex++;
            this.showStep(this.currentStepIndex);
        } else {
            this.end();
        }
    },

    prevStep() {
        if (this.currentStepIndex > 0) {
            this.currentStepIndex--;
            this.showStep(this.currentStepIndex);
        }
    },

    showStep(index) {
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tour-highlight');
        }

        const step = this.steps[index];
        const element = document.querySelector(step.element);

        if (!element) {
            console.warn(`Tour step ${index + 1}: Element not found for selector "${step.element}". Skipping.`);
            this.nextStep();
            return;
        }

        this.highlightedElement = element;
        this.highlightedElement.classList.add('tour-highlight');
        this.highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        this.renderPopover(step);
        this.positionPopover(element, step.position);
    },

    renderPopover(step) {
        const isFirstStep = this.currentStepIndex === 0;
        const isLastStep = this.currentStepIndex === this.steps.length - 1;

        this.tourPopover.innerHTML = `
            <h4>${step.title}</h4>
            <p>${step.content}</p>
            <div class="tour-popover-footer">
                <span class="tour-popover-steps">${this.currentStepIndex + 1} / ${this.steps.length}</span>
                <div class="tour-popover-nav">
                    ${!isFirstStep ? '<button data-action="prev">上一步</button>' : ''}
                    <button data-action="end">结束</button>
                    <button data-action="next" class="primary">${isLastStep ? '完成' : '下一步'}</button>
                </div>
            </div>
        `;
    },

    positionPopover(targetElement, position) {
        const targetRect = targetElement.getBoundingClientRect();
        const popoverRect = this.tourPopover.getBoundingClientRect();

        let top = 0, left = 0;
        const offset = 15; // Space between element and popover

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

        // Boundary checks to keep popover on screen
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