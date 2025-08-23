/**
 * JavaFormattingService.java
 *
 * 一个专门用于格式化Java源代码的服务。
 *
 * 设计思路:
 * 为了解决 `google-java-format` 与 Java 9+ 模块系统 (JPMS) 之间的 `IllegalAccessError`，
 * 我们不再在主应用进程中直接调用 Formatter API。
 * 而是，我们将格式化操作委托给一个隔离的子进程。
 *
 * 1.  **隔离执行**: 使用 `ProcessBuilder` 启动一个新的 `java` 进程。
 * 2.  **权限授予**: 在启动子进程时，我们传递所有必需的 `--add-opens` JVM 参数，
 *     以明确授权其访问 `jdk.compiler` 模块的内部 API。这解决了 JPMS 的访问限制问题。
 * 3.  **无文件I/O**: 通过子进程的标准输入(stdin)和标准输出(stdout)来传递代码，
 *     避免了读写临时文件的开销和复杂性。
 * 4.  **资源定位**: 动态地找到 `google-java-format.jar` 的路径和 `java` 可执行文件的路径，
 *     使服务更加健壮和可配置。
 *
 * 这种方法将模块冲突完全隔离在子进程中，主应用无需任何特殊的启动参数，
 * 保持了主应用的整洁和可移植性。
 */
package club.ppmc.idea.service;

import club.ppmc.idea.model.Settings;
// ========================= 修改 START: 导入新需要的类 =========================
import com.google.common.base.Preconditions;
// ========================= 修改 END =========================================
import com.google.googlejavaformat.java.Formatter;
import com.google.googlejavaformat.java.FormatterException;
import java.io.BufferedReader;
import java.io.BufferedWriter;
// ========================= 修改 START: 导入新需要的类 =========================
import java.io.File;
// ========================= 修改 END =========================================
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class JavaFormattingService {

    private final SettingsService settingsService;
    private final String formatterJarPath;
    // ========================= 修改 START: 新增字段存储Guava JAR路径 =========================
    private final String guavaJarPath;
    // ========================= 修改 END ===================================================
    private static final boolean IS_WINDOWS = System.getProperty("os.name").toLowerCase().contains("win");

    public JavaFormattingService(SettingsService settingsService) {
        this.settingsService = settingsService;
        // ========================= 修改 START: 在构造函数中查找两个JAR的路径 ===================
        this.formatterJarPath = findDependencyJarPath(Formatter.class);
        this.guavaJarPath = findDependencyJarPath(Preconditions.class); // Preconditions是Guava库中的一个核心类
        // ========================= 修改 END ===================================================
    }

    /**
     * 格式化给定的Java源代码字符串。
     *
     * @param sourceCode 未经格式化的Java代码。
     * @return 格式化后的Java代码。
     * @throws FormatterException 如果源代码包含无法格式化的严重语法错误。
     * @throws IOException 如果执行子进程时发生I/O错误。
     * @throws InterruptedException 如果执行子进程时线程被中断。
     */
    public String formatSource(String sourceCode) throws FormatterException, IOException, InterruptedException {
        // ========================= 修改 START: 增加对guavaJarPath的检查 =========================
        if (formatterJarPath == null || guavaJarPath == null) {
            log.error("无法找到 google-java-format.jar 或 guava.jar。格式化功能不可用。");
            throw new IOException("格式化工具或其依赖未找到，请检查应用依赖。");
        }
        // ========================= 修改 END ===================================================

        Settings settings = settingsService.getSettings();
        // 优先使用用户配置的JDK 17，其次是后端环境的JDK
        String javaExecutable = settings.getJdkPaths().getOrDefault("jdk17", System.getProperty("java.home") + (IS_WINDOWS ? "\\bin\\java.exe" : "/bin/java"));

        List<String> command = new ArrayList<>();
        command.add(javaExecutable);

        // 为子进程添加解决模块访问问题的JVM参数
        command.add("--add-opens=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED");
        command.add("--add-opens=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED");
        command.add("--add-opens=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED");
        command.add("--add-opens=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED");
        command.add("--add-opens=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED");

        // ========================= 修改 START: 重构命令以使用-cp而不是-jar =======================
        // 构建包含格式化工具及其Guava依赖的类路径
        String classpath = String.join(File.pathSeparator, formatterJarPath, guavaJarPath);
        command.add("-cp");
        command.add(classpath);
        // 指定要运行的主类
        command.add("com.google.googlejavaformat.java.Main");
        // ========================= 修改 END ===================================================

        command.add("-"); // 表示从标准输入读取

        log.info("执行格式化命令: {}", String.join(" ", command));

        ProcessBuilder processBuilder = new ProcessBuilder(command);
        Process process = processBuilder.start();

        // 异步写入源代码到子进程
        try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8))) {
            writer.write(sourceCode);
        }

        // 异步读取格式化后的代码和错误
        String formattedCode = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))
                .lines()
                .collect(Collectors.joining(System.lineSeparator()));

        String errorOutput = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))
                .lines()
                .collect(Collectors.joining(System.lineSeparator()));

        int exitCode = process.waitFor();

        if (exitCode != 0) {
            log.error("格式化子进程执行失败，退出码: {}", exitCode);
            log.error("错误输出: {}", errorOutput);
            // FormatterException 是一个受检异常，但这里我们用它来传递错误信息
            throw new FormatterException("格式化失败: " + (errorOutput.isEmpty() ? "未知错误" : errorOutput));
        }

        return formattedCode;
    }

    /**
     * ========================= 修改 START: 将JAR查找逻辑提取为通用方法 =========================
     * 动态查找包含指定类的依赖项JAR文件的路径。
     * @param classInJar 目标JAR中的任意一个类的Class对象。
     * @return JAR文件的绝对路径字符串，如果找不到则返回null 。
     */
    private String findDependencyJarPath(Class<?> classInJar) {
        try {
            Path path = Paths.get(classInJar.getProtectionDomain().getCodeSource().getLocation().toURI());
            return path.toString();
        } catch (URISyntaxException e) {
            log.error("严重错误: 无法定位包含 {} 的JAR路径", classInJar.getName(), e);
            return null;
        }
    }
    // ========================= 修改 END =======================================================
}