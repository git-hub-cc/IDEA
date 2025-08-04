对问题面板进行完善，给出技术方案。

### 需求说明总结

#### 1. **核心功能需求**
- **实时语法错误检测**：
    - 用户在Monaco编辑器中输入或修改Java代码时，系统需实时检测语法错误。
    - 支持防抖机制（debounce），避免频繁触发分析。
- **错误可视化**：
    - 在编辑器中用红色波浪线标记语法错误位置。
    - 在“问题”面板中列表显示所有错误信息（包括错误消息、文件路径、行号等）。
- **交互跳转**：
    - 用户点击“问题”面板中的错误项时，编辑器需自动跳转到对应代码行。

#### 2. **技术实现需求**
- **前端分析服务**：
    - 使用Web Worker在独立线程中运行语法解析任务，避免阻塞主线程。
    - 集成`java-parser`库解析Java代码，生成语法树（CST）并捕获词法/语法错误。
- **事件驱动通信**：
    - 通过`EventBus`实现模块间通信（如`AnalysisService`、`CodeEditorManager`、`ProblemsManager`）。
    - 消息格式需包含文件路径、错误列表、语法树等关键数据。
- **UI渲染**：
    - 问题面板动态渲染错误列表，支持点击交互。
    - 编辑器需通过Monaco API（`setModelMarkers`）显示错误标记。

#### 3. **性能与体验需求**
- **响应速度**：
    - 防抖机制确保分析请求在用户停止输入后触发（如延迟500ms）。
- **错误覆盖范围**：
    - 支持基础语法错误检测（如括号不匹配、缺少分号等）。
    - 暂不要求语义错误检测（如类型检查、未定义变量等）。

#### 4. **扩展性需求**
- **前后端分离设计**：
    - 当前为纯前端实现，未来可扩展后端语言服务器（如LSP）支持更复杂的错误检测。
- **多语言支持**：
    - 通过`AnalysisService`的分发逻辑（`analyze-java`），可扩展其他语言解析器。

#### 5. **数据流需求**
1. **输入触发**：
    - 用户输入 → `CodeEditorManager` → 防抖调用`triggerAnalysis`。
2. **分析过程**：
    - `AnalysisService` → Web Worker → `java-parser`生成CST和错误列表。
3. **结果反馈**：
    - Worker返回错误数据 → `EventBus`通知 → `CodeEditorManager`更新编辑器标记。
4. **UI更新**：
    - `ProblemsManager`监听事件 → 渲染问题面板。

#### 6. **非功能性需求**
- **兼容性**：支持主流浏览器（Chrome、Firefox、Edge）。
- **错误处理**：捕获解析崩溃异常，避免界面无响应。

---

### 附：关键模块与职责
| 模块                | 职责                                                                 |
|---------------------|----------------------------------------------------------------------|
| `CodeEditorManager` | 监听编辑器变更，触发分析，管理文件状态（如脏标记）。                 |
| `AnalysisService`   | 桥接主线程与Web Worker，分发分析任务。                               |
| `analysis-worker`   | 在Worker中解析代码，返回语法错误列表。                              |
| `ProblemsManager`   | 维护错误数据，渲染问题面板，处理跳转逻辑。                          |
| `EventBus`          | 全局事件中心，协调模块间通信。                                      |


根据您提供的文件内容，特别是 `GitService.java` 和 `application.properties` 中关于SSH推送的配置，生成密钥的目的是为了创建用于Git-Gitee认证的SSH密钥对。

以下是生成SSH密钥的命令和完整步骤：

### 生成密钥命令

在您的终端（如 Git Bash, PowerShell, 或 macOS/Linux Terminal）中执行以下命令。推荐使用 `ed25519` 算法，因为它更现代、更安全。

```bash
ssh-keygen -t ed25519 -C "cc@gmail.com"
```

**命令详解:**
*   `ssh-keygen`: 生成密钥的工具。
*   `-t ed25519`: 指定密钥的加密算法为 `ed25519`。如果需要兼容旧系统，可以使用 `rsa`：`ssh-keygen -t rsa -b 4096 -C "your_email@example.com"`。
*   `-C "your_email@example.com"`: 提供一个注释，通常是你的邮箱地址，用于标识这个密钥。

### 执行步骤

1.  **运行命令**
    在终端中输入上述命令后，按 `Enter`。

2.  **指定文件路径**
    系统会提示你保存密钥的位置：
    ```
    > Enter a file in which to save the key (/c/Users/You/.ssh/id_ed25519):
    ```
    *   **推荐做法**: 直接按 `Enter` 接受默认路径。这会将密钥保存在用户主目录下的 `.ssh` 文件夹中。
    *   **注意**: 您的 `application.properties` 文件中似乎有一个路径笔误 `C:\\Users\\User\\.ssh\\.ssh\\`。正确的路径应该是 `C:\\Users\\User\\.ssh\\`。请确保配置文件中的路径与密钥实际保存的路径一致。

3.  **设置密码 (Passphrase)**
    接下来，系统会要求你输入一个密码：
    ```
    > Enter passphrase (empty for no passphrase):
    > Enter same passphrase again:
    ```
    *   这是一个为你的私钥增加额外安全性的密码。每次使用该私钥时（例如 `git push`），都需要输入此密码。
    *   **如果不需要密码**: 直接按 `Enter` 两次即可。这在自动化脚本中很常见。
    *   你的 `application.properties` 文件中有 `gitee.ssh.passphrase` 配置项，如果你在这里设置了密码，就需要将它填入该配置项。

4.  **完成**
    成功后，你会在终端看到类似以下的输出，表示密钥已生成：
    ```
    Your identification has been saved in /c/Users/You/.ssh/id_ed25519
    Your public key has been saved in /c/Users/You/.ssh/id_ed25519.pub
    The key fingerprint is:
    SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx your_email@example.com
    The key's randomart image is:
    ...
    ```

### 后续步骤（关键）

生成密钥后，你需要：

1.  **获取公钥内容**:
    打开 `.pub` 文件（例如 `id_ed25519.pub`），复制里面所有的内容。它通常以 `ssh-ed25519` 或 `ssh-rsa` 开头。
    你可以使用 `cat ~/.ssh/id_ed25519.pub` (Linux/Git Bash) 或用记事本打开来查看。

2.  **添加到 Gitee**:
    *   登录你的 Gitee 账号。
    *   进入 "设置" -> "安全设置" -> "SSH公钥"。
    *   点击 "添加公钥"，将你复制的内容粘贴进去，并为它起一个标题（例如 "My Web IDE Key"）。

3.  **配置后端项目**:
    确保 `application.properties` 文件中的 `gitee.ssh.private-key-path` 指向你刚刚生成的 **私钥** 文件（例如 `C:/Users/User/.ssh/id_ed25519`），并正确配置 `gitee.ssh.passphrase`（如果设置了密码）。


ssh-keygen -p -m PEM -f C:/Users/User/.ssh/id_ed25519


