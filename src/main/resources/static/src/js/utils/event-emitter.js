// src/js/utils/event-emitter.js - 全局事件总线（单例模式）

/**
 * @class EventEmitter
 * @description 一个简单的事件发布/订阅实现。
 */
function EventEmitter() {
    this.events = {};
}

/**
 * @description 注册一个事件监听器。
 * @param {string} eventName - 事件名称。
 * @param {Function} listener - 监听函数。
 */
EventEmitter.prototype.on = function(eventName, listener) {
    if (!this.events[eventName]) {
        this.events[eventName] = [];
    }
    this.events[eventName].push(listener);
};

/**
 * @description 触发一个事件。
 * @param {string} eventName - 事件名称。
 * @param {...any} args - 传递给监听器的参数。
 * @returns {Array<any>} - 返回所有监听器执行后的返回值数组。
 */
EventEmitter.prototype.emit = function(eventName, ...args) {
    const results = [];
    if (this.events[eventName]) {
        // 创建一个副本，防止在回调中修改原始数组导致问题
        const listeners = this.events[eventName].slice();
        listeners.forEach(function(listener) {
            try {
                // ========================= 关键修改 START =========================
                // 收集监听器的返回值
                results.push(listener.apply(null, args));
                // ========================= 关键修改 END ===========================
            } catch (e) {
                console.error(`事件 '${eventName}' 的监听器执行出错:`, e);
            }
        });
    }
    return results; // 返回结果数组
};

/**
 * @description 移除一个事件监听器。
 * @param {string} eventName - 事件名称。
 * @param {Function} listener - 要移除的监听函数。
 */
EventEmitter.prototype.off = function(eventName, listener) {
    if (this.events[eventName]) {
        this.events[eventName] = this.events[eventName].filter(function(l) {
            return l !== listener;
        });
    }
};

// 创建一个单例并导出，确保整个应用共享同一个 EventBus 实例
const EventBus = new EventEmitter();

export default EventBus;