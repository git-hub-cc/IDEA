// main.js - 应用入口与初始化
import { UIManager } from './ui-manager.js';
import { FileTree } from './components/file-tree.js';
import { CodeEditor } from './components/code-editor.js';
import { ConsoleOutput } from './components/console-output.js';
import { ProblemsList } from './components/problems-list.js';
import { TerminalEmulator } from './components/terminal-emulator.js';
import { DebuggerPanel } from './components/debugger-panel.js';
import { Toolbar } from './components/toolbar.js';
import { StatusBar } from './components/status-bar.js';
import { ModalManager } from './components/modals.js';
import { KeyboardShortcuts } from './components/keyboard-shortcuts.js';
import { ThemeManager } from './utils/theme-manager.js';
import { EventEmitter } from './utils/event-emitter.js';

import { NetworkService } from './services/network-service.js';
import { FileNode } from './models/file-node.js'; // 确保 FileNode 也被引入
import { mockProblems, mockDebuggerInfo, mockGitStatus } from './mock-data.js'; // 引入模拟数据

// 创建全局事件总线
const eventBus = new EventEmitter();

// --- 定义项目根路径 ---
// 这个路径是相对于后端 app.workspace-root 的项目文件夹名称
// 比如：如果你的后端 workspace-root 下有一个叫 "demo-project" 的文件夹，它里面是你的Maven/Gradle项目
// 那么这里就应该设为 'demo-project'
const CURRENT_PROJECT_PATH = 'demo-project'; // !!! 确保这里与你的实际项目文件夹名称一致 !!!
const MAIN_CLASS_PATH = 'com.example.Main'; // !!! 确保这里是你的 Java 主类的完整包名.类名 !!!

document.addEventListener('DOMContentLoaded', async () => {
    // --- 初始化核心服务 ---
    const networkService = new NetworkService(eventBus);
    const uiManager = new UIManager(eventBus);
    const themeManager = new ThemeManager(eventBus, 'dark-theme');
    const modalManager = new ModalManager('modal-overlay', 'common-modal');
    const keyboardShortcuts = new KeyboardShortcuts(eventBus); // 快捷键管理器

    // --- 初始化 UI 组件 ---
    const fileTree = new FileTree('file-tree', [], eventBus); // 初始空数据，等待后端加载
    const codeEditor = new CodeEditor('editor-area', 'editor-tab-bar', eventBus);
    const consoleOutput = new ConsoleOutput('console-output'); // 在这里声明
    const problemsList = new ProblemsList('problems-list', eventBus);
    const terminalEmulator = new TerminalEmulator('terminal-panel');
    const debuggerPanel = new DebuggerPanel('debugger-panel');
    const toolbar = new Toolbar('toolbar', eventBus);
    const statusBar = new StatusBar('status-bar');

    // --- 启动服务和组件 ---
    uiManager.init();
    themeManager.init();
    terminalEmulator.init(); // xterm.js 初始化
    await codeEditor.initMonaco(); // 确保Monaco Editor已加载并初始化
    codeEditor.setupBreakpointListener(); // 开启断点模拟监听

    // 连接 WebSocket
    try {
        await networkService.connectWebSocket();
        eventBus.emit('log', '[System] WebSocket 已连接.');
        statusBar.updateStatus('就绪');
    } catch (error) {
        eventBus.emit('log', `[System ERROR] WebSocket 连接失败: ${error.message}`);
        statusBar.updateStatus('网络错误');
        modalManager.showAlert('网络错误', `无法连接到后端服务：${error.message}\n请确保后端已运行在 ${networkService.baseUrl}`);
        return; // 无法连接后端则停止初始化
    }

    // --- 将 loadProjectTree 函数移动到这里，作为 DOMContentLoaded 内部的局部函数 ---
    async function loadProjectTree() {
        try {
            // 请求后端获取指定项目的根文件树
            // 后端 /api/files/tree?path=demo-project 会返回 demo-project 这个FileNode
            const treeData = await networkService.getFileTree(CURRENT_PROJECT_PATH);

            // 后端返回的是单个根FileNode，但前端FileTree组件期望一个数组
            // 所以将其封装成一个数组再传给 fileTree.updateData
            const transformedData = [transformObjectToFileNode(treeData)];
            fileTree.updateData(transformedData);
            consoleOutput.log(`[System] 项目树已从后端加载.`); // 现在 consoleOutput 是可访问的

            // 尝试打开根项目下的一个默认文件
            if (treeData && treeData.children && treeData.children.length > 0) {
                const defaultFile = findFirstJavaFile(treeData) || findFirstFile(treeData);
                if (defaultFile) {
                    eventBus.emit('fileOpenRequest', defaultFile.path);
                }
            }
        } catch (error) {
            consoleOutput.error(`[File Error] 无法加载项目树: ${error.message}`); // 现在 consoleOutput 是可访问的
            modalManager.showAlert('错误', `无法加载项目树：${error.message}\n请检查后端工作区配置和前端路径设置。`);
        }
    }
    // --- loadProjectTree 函数结束 ---

    // 初始加载文件树
    await loadProjectTree(); // 现在可以安全调用了

    // --- 注册事件监听器 ---

    // 监听 WebSocket 连接/断开
    eventBus.on('websocketConnected', () => statusBar.updateStatus('就绪'));
    eventBus.on('websocketDisconnected', (error) => statusBar.updateStatus('离线: ' + (error ? error.message : 'WebSocket断开')));

    // 监听后端日志流
    eventBus.on('buildLog', (log) => consoleOutput.log(`[BUILD] ${log}`));
    eventBus.on('runLog', (log) => consoleOutput.log(`[RUN] ${log}`));
    // 调试事件处理函数需要传递所有它依赖的实例
    eventBus.on('debugEvent', (eventData) => handleDebugEvent(eventData, consoleOutput, codeEditor, statusBar, debuggerPanel, uiManager));
    eventBus.on('log', (message) => consoleOutput.log(message)); // 通用日志

    // 监听文件树的打开文件事件
    eventBus.on('fileOpenRequest', async (filePath) => {
        try {
            const content = await networkService.getFileContent(filePath);
            codeEditor.openFile(filePath, content);
            const fileName = filePath.split('/').pop();
            const fileType = codeEditor.getLanguageFromPath(filePath);
            statusBar.updateFileInfo(fileName, fileType, 1, 1);
            // 这里Git状态应由后端提供，目前先用模拟
            statusBar.updateGitBranch('master', { modified: 0, added: 0, deleted: 0 });
        } catch (error) {
            consoleOutput.error(`[File Error] 无法打开文件 ${filePath}: ${error.message}`);
            modalManager.showAlert('错误', `无法打开文件 ${filePath}: ${error.message}`);
        }
    });

    // 监听Monaco Editor的光标变化事件
    eventBus.on('editorCursorChange', (position) => {
        statusBar.updateCursorPos(position.lineNumber, position.column);
    });

    // 监听Monaco Editor的内容变化事件 (用于未保存指示器和模拟代码分析)
    eventBus.on('editorContentChange', (model) => {
        const filePath = model.uri.path.startsWith('/') ? model.uri.path.substring(1) : model.uri.path;
        codeEditor.markFileModified(filePath, true); // 标记文件为已修改
        statusBar.markUnsaved(true); // 状态栏显示未保存指示器
        // 模拟代码诊断（前端），如果后端有诊断服务，这里会替换为调用后端
        codeEditor.simulateDiagnostics(model);
    });

    // 监听问题列表更新事件，更新ProblemsList组件
    eventBus.on('diagnosticsUpdated', ({ filePath, markers }) => {
        // 后端诊断结果的格式可能与Monaco Markers略有不同，需要转换
        const problems = markers.map(m => ({
            type: m.severity === window.monaco.MarkerSeverity.Error ? 'error' :
                (m.severity === window.monaco.MarkerSeverity.Warning ? 'warning' : 'info'),
            message: m.message,
            file: filePath,
            line: m.startLineNumber,
            column: m.startColumn
        }));
        problemsList.updateProblems(problems);
    });


    // 监听文件保存事件
    eventBus.on('fileSaved', async (filePath) => {
        try {
            const model = codeEditor.monacoInstance.getModel();
            const content = model.getValue();
            await networkService.saveFileContent(filePath, content);
            codeEditor.markFileModified(filePath, false);
            statusBar.markUnsaved(false);
            statusBar.updateStatus('文件已保存');
            consoleOutput.log(`[System] 文件 '${filePath.split('/').pop()}' 已保存。`);
            setTimeout(() => statusBar.updateStatus('就绪'), 2000);
            await loadProjectTree(); // 保存后刷新文件树，以便反映后端文件系统状态变化 (如新文件)
        } catch (error) {
            consoleOutput.error(`[File Error] 无法保存文件 ${filePath}: ${error.message}`);
            modalManager.showAlert('错误', `保存文件失败: ${error.message}`);
            statusBar.updateStatus('保存失败');
            setTimeout(() => statusBar.updateStatus('就绪'), 2000);
        }
    });

    // 监听问题列表项点击事件
    eventBus.on('problemClicked', ({ filePath, lineNumber }) => {
        eventBus.emit('fileOpenRequest', filePath); // 先打开文件
        codeEditor.gotoLine(lineNumber); // 再跳转行
    });

    // 监听工具栏动作
    eventBus.on('toolbarAction', async (action) => {
        switch (action) {
            case 'new-file':
                await handleNewFileAction(modalManager, networkService, fileTree, consoleOutput, eventBus, loadProjectTree, codeEditor);
                break;
            case 'open-file':
                modalManager.showAlert('打开文件', '请通过左侧文件树选择并点击文件来打开。');
                break;
            case 'save-file':
                const activeFilePath = codeEditor.activeFilePath;
                if (activeFilePath) {
                    eventBus.emit('fileSaved', activeFilePath);
                } else {
                    consoleOutput.log('[System] 没有打开的文件可供保存。');
                    statusBar.updateStatus('无文件可保存');
                    setTimeout(() => statusBar.updateStatus('就绪'), 2000);
                }
                break;
            case 'run-code':
                // 确保传入了 uiManager
                await handleRunCodeAction(networkService, consoleOutput, problemsList, statusBar, modalManager, uiManager);
                break;
            case 'debug-code':
                await handleDebugCodeAction(networkService, consoleOutput, problemsList, debuggerPanel, statusBar, uiManager, codeEditor, eventBus);
                break;
            case 'vcs-commit':
            case 'vcs-pull':
            case 'vcs-push':
                modalManager.showAlert('版本控制', `模拟 ${action.replace('vcs-', '')} 操作。实际Git功能将在后续阶段实现。`).then(() => {
                    consoleOutput.log(`[System] 模拟 ${action.replace('vcs-', '')} 操作。`);
                    // 模拟Git状态变化
                    statusBar.updateGitBranch('master', { modified: 0, added: 0, deleted: 0 });
                });
                break;
            case 'settings':
                await showSettingsModal(modalManager, themeManager, codeEditor, networkService, consoleOutput);
                break;
            case 'about':
                modalManager.showAlert('关于 Web IDEA', '这是一个由 Web 技术构建的 IntelliJ IDEA 前端原型。\n\n版本：1.0.0-mock\n作者：ChatGPT\n\n此版本已集成后端服务，可进行真实文件操作和Java代码编译运行。');
                break;
            // 调试器控制按钮动作
            case 'step-over': consoleOutput.log('[Debugger] 步过...'); await networkService.stepOver(); break;
            case 'step-into': consoleOutput.log('[Debugger] 步入...'); await networkService.stepInto(); break;
            case 'step-out': consoleOutput.log('[Debugger] 步出...'); await networkService.stepOut(); break;
            case 'resume-debug': consoleOutput.log('[Debugger] 恢复程序...'); await networkService.resumeDebug(); break;
            case 'stop-debug':
                await networkService.stopDebug();
                statusBar.updateStatus('就绪');
                debuggerPanel.clearDebuggerInfo();
                codeEditor.clearDebugHighlight();
                break;
        }
    });

    // 监听自定义右键菜单事件
    eventBus.on('showContextMenu', async ({ x, y, itemPath, itemType }) => {
        await showFileContextMenu(x, y, itemPath, itemType, modalManager, networkService, fileTree, codeEditor, eventBus, consoleOutput, loadProjectTree);
    });

    // 初始加载问题列表 (模拟在启动时就有一些问题，可根据后端实际情况调整)
    problemsList.updateProblems(mockProblems);
    // 首次加载时更新状态栏Git信息
    statusBar.updateGitBranch('master', mockGitStatus.counts);
});

// --- 辅助函数 (将所有依赖的实例作为参数传递) ---

// 递归查找第一个文件
function findFirstFile(node) {
    if (node.type === 'file') {
        return node;
    }
    if (node.children) {
        for (const child of node.children) {
            const found = findFirstFile(child);
            if (found) return found;
        }
    }
    return null;
}

// 递归查找第一个Java文件
function findFirstJavaFile(node) {
    if (node.type === 'file' && node.name.endsWith('.java')) {
        return node;
    }
    if (node.children) {
        for (const child of node.children) {
            const found = findFirstJavaFile(child);
            if (found) return found;
        }
    }
    return null;
}

// 将后端返回的普通JS对象递归转换为FileNode实例
function transformObjectToFileNode(obj) {
    if (!obj) return null;
    const children = obj.children ? obj.children.map(child => transformObjectToFileNode(child)) : [];
    // 后端路径是相对web-idea-workspace的，前端可能需要保持一致
    const node = new FileNode(obj.name, obj.type, obj.path, obj.content, children, obj.gitStatus, obj.isExpanded);
    node.isDirty = obj.isDirty || false; // 保持修改状态
    return node;
}


// handleDebugEvent 也要接收所有需要的实例
function handleDebugEvent(eventData, consoleOutput, codeEditor, statusBar, debuggerPanel, uiManager) {
    // 后端WebSocket发送的可能已经是字符串了，这里再做一次检查
    if (typeof eventData !== 'string') {
        try {
            eventData = JSON.stringify(eventData);
        } catch (e) {
            console.error("Failed to stringify debug event data:", e);
            consoleOutput.error("DEBUG: Malformed debug event data.");
            return;
        }
    }

    if (eventData.startsWith('DEBUG:')) {
        consoleOutput.log(eventData);
        if (eventData.includes('Paused at')) {
            const parts = eventData.split(' ');
            const filePathPart = parts[4]; // e.g., "Main.java:18"
            const [fileName, lineNumberStr] = filePathPart.split(':');
            const lineNumber = parseInt(lineNumberStr, 10);
            // 调试信息中的文件名可能不包含完整路径，需要根据项目结构补全
            // 假设所有 Java 文件都在 demo-project/src/main/java/com/example/ 下
            const relativeFilePath = `${CURRENT_PROJECT_PATH}/src/main/java/com/example/${fileName}`;

            codeEditor.highlightDebugLine(relativeFilePath, lineNumber);
            statusBar.updateStatus(`调试器暂停于 ${fileName}:${lineNumber}`);
        } else if (eventData.includes('Debugging session stopped.')) {
            // 清理已在 toolbarAction 中处理
        }
    } else if (eventData.startsWith('VARIABLES:')) {
        const varsJson = eventData.substring('VARIABLES:'.length).trim();
        try {
            const variables = JSON.parse(varsJson);
            // 注意：这里假设后端发送的是完整的变量列表，直接覆盖
            debuggerPanel.showDebuggerInfo({
                variables: variables,
                callStack: Array.from(debuggerPanel.callStackList.children).map(li => li.textContent) // 保持旧的调用栈
            });
            uiManager.activateBottomPanelTab('debugger-panel'); // 确保激活调试面板
        } catch (e) {
            console.error('Failed to parse debug variables:', e);
            consoleOutput.error('DEBUG: Failed to parse variables.');
        }
    } else if (eventData.startsWith('CALLSTACK:')) {
        const stackJson = eventData.substring('CALLSTACK:'.length).trim();
        try {
            const callStack = JSON.parse(stackJson);
            // 注意：这里假设后端发送的是完整的调用栈，直接覆盖
            debuggerPanel.showDebuggerInfo({
                callStack: callStack.map(s => ({ method: s, file: 'N/A', line: 0 })), // 模拟更详细的栈帧信息
                variables: Array.from(debuggerPanel.variablesList.children).map(li => li.textContent) // 保持旧的变量
            });
            uiManager.activateBottomPanelTab('debugger-panel'); // 确保激活调试面板
        } catch (e) {
            console.error('Failed to parse debug callstack:', e);
            consoleOutput.error('DEBUG: Failed to parse callstack.');
        }
    }
}


// handleNewFileAction 也要接收所有需要的实例
async function handleNewFileAction(modalManager, networkService, fileTree, consoleOutput, eventBus, loadProjectTree, codeEditor) {
    try {
        const createFormDiv = document.createElement('div');
        createFormDiv.innerHTML = `
            <p>请选择类型并输入名称：</p>
            <label for="create-type-select">类型:</label>
            <select id="create-type-select">
                <option value="file">文件</option>
                <option value="directory">文件夹</option>
            </select>
            <br><br>
            <label for="create-name-input">名称:</label>
            <input type="text" id="create-name-input" placeholder="请输入名称">
            <br><br>
            <label for="create-path-input">父路径:</label>
            <input type="text" id="create-path-input" value="${CURRENT_PROJECT_PATH}" readonly>
        `;

        const result = await modalManager.showModal('新建', createFormDiv);
        if (result === true) { // 模态框确认
            const name = createFormDiv.querySelector('#create-name-input').value.trim();
            const type = createFormDiv.querySelector('#create-type-select').value;
            const parentPath = createFormDiv.querySelector('#create-path-input').value.trim();

            if (!name) {
                modalManager.showAlert('错误', '名称不能为空！');
                return;
            }

            const newFullPath = parentPath ? `${parentPath}/${name}` : name;

            try {
                const response = await networkService.createFile(parentPath, name, type);
                consoleOutput.log(`[System] 后端响应: ${response}`);
                // 重新加载文件树
                await loadProjectTree();
                consoleOutput.log(`[System] 成功创建${type}: ${newFullPath}`);
                if (type === 'file') {
                    eventBus.emit('fileOpenRequest', newFullPath); // 自动打开新创建的文件
                }
            } catch (error) {
                consoleOutput.error(`[File Error] 创建失败: ${error.message}`);
                modalManager.showAlert('错误', `创建失败: ${error.message}`);
            }
        } else {
            consoleOutput.log('[System] 新建操作已取消。');
        }
    } catch (e) {
        if (e && e.message !== 'Modal operation cancelled.') {
            consoleOutput.error('[System] 显示新建模态框时发生错误:', e);
        }
    }
}

// main.js - handleRunCodeAction

async function handleRunCodeAction(networkService, consoleOutput, problemsList, statusBar, modalManager,uiManager) {
    consoleOutput.clear();
    problemsList.clear();
    statusBar.updateStatus('构建与运行中...');
    // 激活控制台面板，确保用户能看到日志
    uiManager.activateBottomPanelTab('console-output');

    try {
        // --- 简化后的逻辑：只调用构建接口 ---
        // 后端将在构建成功后自动触发运行
        await networkService.buildProject(CURRENT_PROJECT_PATH);
        consoleOutput.log('[System] 构建与运行请求已发送。请在下方控制台查看实时日志...');

        // 注意：我们不再在这里更新状态，状态的最终结果应由WebSocket消息驱动
        // 例如，可以监听一个 "/topic/process-status" 的新topic来更新statusBar
        // 但为了简化，目前让它保持“构建与运行中...”，直到下一次操作。

    } catch (buildError) {
        consoleOutput.error(`[Build Error] 发送构建请求失败: ${buildError.message}`);
        modalManager.showAlert('构建错误', `发送构建请求失败: ${buildError.message}`);
        statusBar.updateStatus('构建请求失败');
        setTimeout(() => statusBar.updateStatus('就绪'), 2000);
    }
}

// handleDebugCodeAction 也要接收所有需要的实例
async function handleDebugCodeAction(networkService, consoleOutput, problemsList, debuggerPanel, statusBar, uiManager, codeEditor, eventBus) {
    consoleOutput.clear();
    problemsList.clear();
    debuggerPanel.clearDebuggerInfo();
    codeEditor.clearDebugHighlight();
    statusBar.updateStatus('启动调试器...');

    try {
        const response = await networkService.startDebug(CURRENT_PROJECT_PATH, MAIN_CLASS_PATH);
        consoleOutput.log(`[System] ${response} 等待调试事件...`);
        statusBar.updateStatus('调试中...');
        uiManager.activateBottomPanelTab('debugger-panel');
    } catch (error) {
        consoleOutput.error(`[Debug Error] 启动调试失败: ${error.message}`);
        modalManager.showAlert('调试错误', `启动调试失败: ${error.message}`);
        statusBar.updateStatus('调试失败');
    }
}

// showSettingsModal 也要接收 consoleOutput
async function showSettingsModal(modalManager, themeManager, codeEditor, networkService, consoleOutput) {
    const settingsBody = document.createElement('div');
    const currentFontSize = codeEditor.monacoInstance?.getOption(window.monaco.editor.EditorOption.fontSize) || 14;
    const currentMinimapEnabled = codeEditor.monacoInstance?.getOption(window.monaco.editor.EditorOption.minimap).enabled || true;

    settingsBody.innerHTML = `
        <label for="theme-select">主题:</label>
        <select id="theme-select">
            <option value="dark-theme" ${themeManager.getCurrentTheme() === 'dark-theme' ? 'selected' : ''}>Darcula (深色)</option>
            <option value="light-theme" ${themeManager.getCurrentTheme() === 'light-theme' ? 'selected' : ''}>IntelliJ Light (浅色)</option>
        </select>
        <br><br>
        <label for="font-size-input">字体大小:</label>
        <input type="number" id="font-size-input" min="10" max="24" value="${currentFontSize}">
        <br><br>
        <label for="minimap-toggle">小地图:</label>
        <input type="checkbox" id="minimap-toggle" ${currentMinimapEnabled ? 'checked' : ''}>
    `;

    try {
        await modalManager.showModal('设置', settingsBody);

        const themeSelect = settingsBody.querySelector('#theme-select');
        const fontSizeInput = settingsBody.querySelector('#font-size-input');
        const minimapToggle = settingsBody.querySelector('#minimap-toggle');

        themeManager.setTheme(themeSelect.value);

        const newFontSize = parseInt(fontSizeInput.value, 10);
        if (!isNaN(newFontSize) && newFontSize >= 10 && newFontSize <= 24) {
            codeEditor.monacoInstance.updateOptions({ fontSize: newFontSize });
        }

        codeEditor.monacoInstance.updateOptions({ minimap: { enabled: minimapToggle.checked } });

        consoleOutput.log('[System] 设置已应用。');
    } catch (e) {
        if (e && e.message === 'Modal operation cancelled.') {
            consoleOutput.log('[System] 设置已取消。');
        } else {
            consoleOutput.error('[System] 应用设置时发生未知错误:', e);
        }
    }
}

// showFileContextMenu 也要接收 consoleOutput 和 loadProjectTree
async function showFileContextMenu(x, y, itemPath, itemType, modalManager, networkService, fileTree, codeEditor, eventBus, consoleOutput, loadProjectTree) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.innerHTML = `
        <button data-action="new-file-folder">新建文件/文件夹</button>
        <button data-action="delete">删除</button>
        <button data-action="rename">重命名</button>
        <hr>
        <button data-action="copy-path">复制路径</button>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => {
        if (menu.parentNode) {
            menu.parentNode.removeChild(menu);
        }
        document.removeEventListener('click', clickOutside);
        document.removeEventListener('contextmenu', closeMenu);
    };

    setTimeout(() => {
        document.addEventListener('click', clickOutside);
        document.addEventListener('contextmenu', closeMenu);
    }, 100);

    const clickOutside = (e) => {
        if (!menu.contains(e.target)) {
            closeMenu();
        }
    };


    menu.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (!action) return;

        closeMenu();

        switch (action) {
            case 'new-file-folder':
                try {
                    const createFormDiv = document.createElement('div');
                    createFormDiv.innerHTML = `
                        <p>在 <b>${itemPath}</b> 下新建:</p>
                        <label for="create-type-select">类型:</label>
                        <select id="create-type-select">
                            <option value="file">文件</option>
                            <option value="directory">文件夹</option>
                        </select>
                        <br><br>
                        <label for="create-name-input">名称:</label>
                        <input type="text" id="create-name-input" placeholder="请输入名称">
                    `;
                    const result = await modalManager.showModal('新建', createFormDiv);

                    if (result === true) {
                        const name = createFormDiv.querySelector('#create-name-input').value.trim();
                        const type = createFormDiv.querySelector('#create-type-select').value;
                        if (!name) {
                            modalManager.showAlert('错误', '名称不能为空！');
                            return;
                        }
                        // 如果在文件上右键，父路径是文件的目录；如果在文件夹上右键，父路径就是该文件夹
                        const parentPath = itemType === 'folder' ? itemPath : itemPath.substring(0, itemPath.lastIndexOf('/'));
                        const newFullPath = parentPath === '.' ? name : `${parentPath}/${name}`; // Handle root path '.'


                        await networkService.createFile(parentPath, name, type);
                        eventBus.emit('log', `[System] 成功创建 ${type}: ${newFullPath}`);
                        await loadProjectTree(); // 刷新文件树
                        if (type === 'file') {
                            eventBus.emit('fileOpenRequest', newFullPath);
                        }
                    } else {
                        eventBus.emit('log', '[System] 新建操作已取消。');
                    }
                } catch (error) {
                    if (error && error.message !== 'Modal operation cancelled.') {
                        eventBus.emit('error', `[File Error] 新建失败: ${error.message}`);
                        modalManager.showAlert('错误', `新建失败: ${error.message}`);
                    }
                }
                break;
            case 'delete':
                try {
                    const confirm = await modalManager.showConfirm('删除', `确定要删除 ${itemPath} 吗？此操作不可撤销。`);
                    if (confirm) {
                        await networkService.deleteFile(itemPath);
                        eventBus.emit('log', `[System] 成功删除: ${itemPath}`);
                        await loadProjectTree(); // 刷新文件树
                        // 如果删除的是当前打开的文件，关闭它
                        if (codeEditor.activeFilePath === itemPath) {
                            codeEditor.closeFile(itemPath);
                        }
                    } else {
                        eventBus.emit('log', '[System] 删除操作已取消。');
                    }
                } catch (error) {
                    if (error && error.message !== 'Modal operation cancelled.') {
                        eventBus.emit('error', `[File Error] 删除失败: ${error.message}`);
                        modalManager.showAlert('错误', `删除失败: ${error.message}`);
                    }
                }
                break;
            case 'rename':
                try {
                    const oldFileName = itemPath.split('/').pop();
                    const newName = await modalManager.showPrompt('重命名', `请输入 ${itemPath} 的新名称:`, 'rename_input', '重命名', '取消');
                    if (newName && newName.trim() !== '') {
                        const parentPath = itemPath.substring(0, itemPath.lastIndexOf('/'));
                        // 新路径是父路径 + 新名字
                        const newFullPath = parentPath === '.' ? newName.trim() : `${parentPath}/${newName.trim()}`;


                        await networkService.renameFile(itemPath, newFullPath);
                        eventBus.emit('log', `[System] 成功重命名 ${itemPath} 为 ${newFullPath}`);
                        await loadProjectTree(); // 刷新文件树
                        // 如果是当前打开的文件，更新其路径
                        if (codeEditor.activeFilePath === itemPath) {
                            codeEditor.closeFile(itemPath); // 关闭旧的
                            eventBus.emit('fileOpenRequest', newFullPath); // 打开新的
                        }
                    } else if (newName === '') {
                        modalManager.showAlert('错误', '名称不能为空！');
                    } else {
                        eventBus.emit('log', '[System] 重命名操作已取消。');
                    }
                } catch (error) {
                    if (error && error.message !== 'Modal operation cancelled.') {
                        eventBus.emit('error', `[File Error] 重命名失败: ${error.message}`);
                        modalManager.showAlert('错误', `重命名失败: ${error.message}`);
                    }
                }
                break;
            case 'copy-path':
                try {
                    await navigator.clipboard.writeText(itemPath);
                    eventBus.emit('log', `[System] 路径已复制到剪贴板: ${itemPath}`);
                    modalManager.showAlert('成功', `路径已复制到剪贴板:\n${itemPath}`);
                } catch (err) {
                    eventBus.emit('error', `[System Error] 复制路径失败: ${err.message}`);
                    modalManager.showAlert('错误', `复制路径失败: ${err.message}`);
                }
                break;
        }
    });
}