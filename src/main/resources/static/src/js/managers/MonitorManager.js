// src/js/managers/MonitorManager.js - 系统监控面板管理器

import EventBus from '../utils/event-emitter.js';

/**
 * @description 管理“监控”面板的UI，包括创建和实时更新CPU、内存和网络图表。
 * 使用 Chart.js 库进行图表绘制。
 */
const MonitorManager = {
    isInitialized: false,
    cpuChart: null,
    memChart: null,
    netChart: null,
    maxDataPoints: 60, // 图表中最多显示的数据点数量

    /**
     * @description 初始化监控管理器。
     * 真正的图表设置工作会延迟到面板首次被激活时进行。
     */
    init: function() {
        this.bindAppEvents();
    },

    /**
     * @description 绑定应用事件。
     */
    bindAppEvents: function() {
        // 监听面板激活事件以进行惰性初始化
        EventBus.on('ui:activateBottomPanelTab', (panelId) => {
            if (panelId === 'monitor-panel' && !this.isInitialized) {
                this.setupCharts();
            }
        });

        // 监听来自后端的数据更新
        EventBus.on('monitor:data-update', this.handleDataUpdate.bind(this));
    },

    /**
     * @description 执行图表的首次设置和创建。
     */
    setupCharts: function() {
        if (this.isInitialized) return;

        if (typeof Chart === 'undefined') {
            console.error("Chart.js 未加载，无法创建监控图表。");
            return;
        }

        // ========================= 优化 START: 定义新的颜色和辅助函数 =========================
        const chartColors = {
            cpu: { border: '#FFB74D', background: 'rgba(255, 183, 77, 0.2)' }, // Amber
            memUsed: { border: '#64B5F6', background: 'rgba(100, 181, 246, 0.2)' }, // Blue
            memTotal: { border: '#4DB6AC', background: 'rgba(77, 182, 172, 0.1)' }, // Teal
            netDown: { border: '#81C784', background: 'rgba(129, 199, 132, 0.2)' }, // Green
            netUp: { border: '#BA68C8', background: 'rgba(186, 104, 200, 0.2)' } // Purple
        };

        const createGradient = (ctx, color) => {
            if (!ctx || !ctx.chart || !ctx.chart.chartArea) return color.background;
            const gradient = ctx.chart.ctx.createLinearGradient(0, ctx.chart.chartArea.bottom, 0, ctx.chart.chartArea.top);
            const rgb = Chart.helpers.color(color.border).rgbString();
            gradient.addColorStop(0, Chart.helpers.color(rgb).alpha(0).rgbString());
            gradient.addColorStop(1, Chart.helpers.color(rgb).alpha(0.3).rgbString());
            return gradient;
        };
        // ========================= 优化 END ==============================================


        this.cpuChart = this.createChart('cpu-chart', 'CPU 使用率 (%)', {
            y: { min: 0, max: 100, ticks: { callback: value => `${value.toFixed(0)}%` } }
        }, [{
            label: 'CPU',
            borderColor: chartColors.cpu.border,
            backgroundColor: (ctx) => createGradient(ctx, chartColors.cpu)
        }]);

        this.memChart = this.createChart('mem-chart', '内存使用情况', {
            y: { min: 0, ticks: { callback: value => this.formatBytes(value) } }
        }, [
            {
                label: '已使用',
                borderColor: chartColors.memUsed.border,
                backgroundColor: (ctx) => createGradient(ctx, chartColors.memUsed)
            },
            {
                label: '总计',
                borderColor: chartColors.memTotal.border,
                backgroundColor: chartColors.memTotal.background,
                borderDash: [5, 5],
                fill: false // 总量线不填充背景
            }
        ]);

        this.netChart = this.createChart('net-chart', '网络速率', {
            y: { min: 0, ticks: { callback: value => `${this.formatBytes(value)}/s` } }
        }, [
            {
                label: '下载 (↓)',
                borderColor: chartColors.netDown.border,
                backgroundColor: (ctx) => createGradient(ctx, chartColors.netDown)
            },
            {
                label: '上传 (↑)',
                borderColor: chartColors.netUp.border,
                backgroundColor: (ctx) => createGradient(ctx, chartColors.netUp)
            }
        ]);

        this.isInitialized = true;
        EventBus.emit('log:info', '系统监控面板已初始化。');
    },

    /**
     * @description 创建一个 Chart.js 实例的辅助函数。
     * @param {string} canvasId - canvas 元素的 ID。
     * @param {string} title - 图表标题。
     * @param {object} scales - 图表的刻度配置。
     * @param {Array<object>} datasets - 数据集配置数组。
     * @returns {Chart} Chart.js 实例。
     */
    createChart: function(canvasId, title, scales, datasets) {
        const ctx = document.getElementById(canvasId).getContext('2d');

        // ========================= 优化 START: 读取CSS变量用于样式 =========================
        const styles = getComputedStyle(document.body);
        const textPrimary = styles.getPropertyValue('--text-primary').trim();
        const textSecondary = styles.getPropertyValue('--text-secondary').trim();
        const borderColor = styles.getPropertyValue('--border-color').trim();
        const panelBg = styles.getPropertyValue('--bg-panel').trim();
        // ========================= 优化 END ==============================================

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: datasets.map(d => ({
                    label: d.label,
                    data: [],
                    borderColor: d.borderColor,
                    backgroundColor: d.backgroundColor,
                    borderWidth: 2, // 线条加粗一点
                    fill: d.fill !== false,
                    borderDash: d.borderDash || [],
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { // 优化交互
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: { display: true, text: title, color: textPrimary, font: { size: 14 } },
                    legend: { labels: { color: textSecondary } },
                    // ========================= 优化 START: 自定义工具提示 =========================
                    tooltip: {
                        enabled: true,
                        backgroundColor: panelBg,
                        titleColor: textPrimary,
                        bodyColor: textSecondary,
                        borderColor: borderColor,
                        borderWidth: 1,
                        padding: 10,
                        caretPadding: 10,
                        displayColors: true,
                        boxPadding: 4
                    }
                    // ========================= 优化 END ==============================================
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'second', displayFormats: { second: 'HH:mm:ss' } },
                        ticks: { color: textSecondary, maxRotation: 0, minRotation: 0 },
                        grid: { color: borderColor, drawBorder: false }
                    },
                    y: {
                        ...scales.y,
                        beginAtZero: true,
                        ticks: { ...scales.y.ticks, color: textSecondary },
                        grid: { color: borderColor, drawBorder: false }
                    }
                },
                elements: {
                    point: { radius: 0, hoverRadius: 4 }, // 悬停时显示点
                    line: { tension: 0.3 } // 线条更平滑
                }
            }
        });
    },

    /**
     * @description 处理从后端收到的新监控数据。
     * @param {object} data - 后端传来的 SystemMetrics DTO。
     */
    handleDataUpdate: function(data) {
        if (!this.isInitialized) return;

        const timestamp = new Date(data.timestamp);

        // 更新 CPU 图表
        this.updateChartData(this.cpuChart, timestamp, [data.cpuUsage * 100]); // 转换为百分比

        // 更新内存图表
        this.updateChartData(this.memChart, timestamp, [data.memoryUsed, data.memoryTotal]);

        // 更新网络图表
        this.updateChartData(this.netChart, timestamp, [data.networkDown, data.networkUp]);
    },

    /**
     * @description 更新单个图表的数据，并管理数据窗口大小。
     * @param {Chart} chart - 要更新的 Chart.js 实例。
     * @param {Date} label - 新数据点的时间戳标签。
     * @param {Array<number>} values - 新数据点的值数组，顺序与数据集对应。
     */
    updateChartData: function(chart, label, values) {
        chart.data.labels.push(label);
        values.forEach((value, index) => {
            if (chart.data.datasets[index]) {
                chart.data.datasets[index].data.push(value);
            }
        });

        // 维持数据窗口大小
        if (chart.data.labels.length > this.maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(dataset => {
                dataset.data.shift();
            });
        }

        chart.update();
    },

    /**
     * @description 将字节数格式化为可读的单位 (KB, MB, GB)。
     * @param {number} bytes - 字节数。
     * @returns {string} 格式化后的字符串。
     */
    formatBytes: function(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
};

export default MonitorManager;