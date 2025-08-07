// src/js/utils/debounce.js

/**
 * @description 创建一个防抖函数。
 * 该函数会从上一次被调用后，延迟 wait 毫秒后调用 func 方法。
 * @param {Function} func - 要进行防抖处理的函数。
 * @param {number} wait - 需要延迟的毫秒数。
 * @returns {Function} 返回一个新的防抖函数。
 */
export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            func.apply(context, args);
        }, wait);
    };
}