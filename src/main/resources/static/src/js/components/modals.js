// modals.js - 弹窗管理逻辑
export class ModalManager {
    constructor(overlayId, modalId) {
        this.overlay = document.getElementById(overlayId);
        this.modal = document.getElementById(modalId);
        this.modalTitle = this.modal.querySelector('#modal-title');
        this.modalBody = this.modal.querySelector('#modal-body');
        this.modalFooter = this.modal.querySelector('#modal-footer');
        this.closeBtn = this.modal.querySelector('.modal-close-btn');

        this.resolvePromise = null; // Promise resolve function
        this.rejectPromise = null; // Promise reject function

        this.addEventListeners();
    }

    addEventListeners() {
        this.closeBtn.addEventListener('click', () => this.closeModal(false));
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.closeModal(false);
            }
        });

        this.modalFooter.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.modal-action-btn');
            if (!actionBtn) return;

            if (actionBtn.dataset.action === 'confirm-modal') {
                this.closeModal(true);
            } else if (actionBtn.dataset.action === 'cancel-modal') {
                this.closeModal(false);
            }
        });
    }

    // showModal 方法现在接收一个可选的 `options` 对象
    // { showFooter: boolean, confirmText: string, cancelText: string }
    showModal(title, bodyContent, options = {}) {
        const { showFooter = true, confirmText = '确定', cancelText = '取消' } = options;

        this.modalTitle.textContent = title;
        if (typeof bodyContent === 'string') {
            this.modalBody.innerHTML = bodyContent;
        } else {
            this.modalBody.innerHTML = ''; // 清空原有内容
            this.modalBody.appendChild(bodyContent); // 插入DOM元素
        }
        this.modalFooter.style.display = showFooter ? 'flex' : 'none';

        const confirmBtn = this.modalFooter.querySelector('[data-action="confirm-modal"]');
        const cancelBtn = this.modalFooter.querySelector('[data-action="cancel-modal"]');
        if (confirmBtn) confirmBtn.textContent = confirmText;
        if (cancelBtn) cancelBtn.textContent = cancelText;

        this.overlay.classList.add('visible');
        this.modal.focus(); // 确保模态框获得焦点

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }

    closeModal(confirmed) {
        this.overlay.classList.remove('visible');
        this.modalBody.innerHTML = '';

        if (confirmed && this.resolvePromise) {
            this.resolvePromise(this.getPromptValue());
        } else if (!confirmed && this.rejectPromise) {
            this.rejectPromise(new Error('Modal operation cancelled.')); // 明确传递一个Error对象
        }
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    // 快捷方法：显示警报
    showAlert(title, message) {
        const bodyDiv = document.createElement('div');
        bodyDiv.textContent = message;
        return this.showModal(title, bodyDiv, { showFooter: true, confirmText: '关闭', cancelText: '' });
    }

    // 快捷方法：显示确认框
    showConfirm(title, message) {
        const bodyDiv = document.createElement('div');
        bodyDiv.textContent = message;
        return this.showModal(title, bodyDiv, { showFooter: true, confirmText: '确认', cancelText: '取消' });
    }

    // 快捷方法：显示提示输入框
    // promptFields: [{ id: 'input1', label: '名称:', type: 'text', placeholder: '请输入...', defaultValue: '' }]
    showPrompt(title, message, inputId, confirmText = '确定', cancelText = '取消') {
        const formDiv = document.createElement('div');
        if (message) {
            const msgP = document.createElement('p');
            msgP.textContent = message;
            formDiv.appendChild(msgP);
        }

        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.id = inputId;
        inputField.placeholder = message; // 兼容旧接口的message作为placeholder
        formDiv.appendChild(inputField);

        return this.showModal(title, formDiv, { confirmText, cancelText });
    }

    // 获取提示输入框的值
    getPromptValue() {
        const input = this.modalBody.querySelector('input[type="text"]');
        return input ? input.value : null;
    }
}