// rollup.config.js

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    // 1. 入口文件
    // 我们创建一个虚拟的入口文件来导入 java-parser
    input: 'entry.js',

    // 2. 输出配置
    output: {
        // 输出文件的路径和名称
        file: 'dist/java-parser.bundle.js',
        // 输出的格式。'umd' 是通用模块定义，它能同时在 <script> 标签、AMD、CommonJS 环境下使用
        format: 'umd',
        // 当在 <script> 标签中使用时，这个库会挂载到 window 对象上，'javaParser' 就是它的名字
        // 这样你就可以在浏览器中通过 `window.javaParser` 或直接 `javaParser` 来访问它
        name: 'javaParser'
    },

    // 3. 插件列表
    plugins: [
        resolve(), // 帮助 Rollup 查找外部模块
        commonjs() // 将 CommonJS 模块转换为 ES6
    ]
};