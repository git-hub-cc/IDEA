// mock-data.js - 前端模拟数据 (保留部分，移除后端会提供的数据)
// 移除 mockFileContent 和 mockProjectData
// import { FileNode } from './models/file-node.js'; // 如果不再需要 mockProjectData，则可以移除

// 问题列表模拟数据 (直到后端提供真实诊断)
export const mockProblems = [
    // 确保这里的路径与后端FileService返回的路径格式一致
    // 例如：'demo-project/src/main/java/com/example/Main.java'
    { type: 'error', message: 'Simulated error: Missing semicolon', file: 'demo-project/src/main/java/com/example/Main.java', line: 15 },
    { type: 'warning', message: 'Simulated warning: Unused import statement', file: 'demo-project/src/main/java/com/example/Main.java', line: 2 },
    { type: 'info', message: 'Simulated info: TODO: Implement logging feature', file: 'demo-project/src/main/java/com/example/Main.java', line: 6 },
    { type: 'error', message: 'Simulated error: Cannot resolve symbol MyObject', file: 'demo-project/src/main/java/com/example/Main.java', line: 36 },
    { type: 'warning', message: 'Simulated warning: FIXME: Potential overflow risk', file: 'demo-project/src/main/java/com/example/Main.java', line: 17 },
    { type: 'info', message: 'Simulated info: TODO: Add more sophisticated greeting logic', file: 'demo-project/src/main/java/com/example/Util.java', line: 5 },
];

// 调试信息模拟数据 (直到后端提供真实调试)
export const mockDebuggerInfo = {
    variables: [
        { name: 'args', type: 'String[]', value: '[]' },
        { name: 'APP_NAME', type: 'String', value: '"Web IDEA Prototype"' },
        { name: 'x', type: 'int', value: 10 },
        { name: 'y', type: 'int', value: 20 },
        { name: 'sum', type: 'int', value: 30 },
        { name: 'messages', type: 'List<String>', value: '["Message 1", "Message 2"]' }
    ],
    callStack: [
        { method: 'main', file: 'Main.java', line: 18 }, // 模拟暂停在这一行
        { method: '<clinit>', file: 'Main.java', line: 5 } // 静态初始化块
    ]
};

// 模拟Git状态，可由后端Git服务填充
export const mockGitStatus = {
    counts: {
        modified: 1,
        added: 1,
        deleted: 0,
        untracked: 1,
    },
};