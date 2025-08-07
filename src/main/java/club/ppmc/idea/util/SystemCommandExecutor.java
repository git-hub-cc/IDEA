/**
 * SystemCommandExecutor.java
 *
 * 这是一个工具类，负责以跨平台、安全的方式异步执行外部系统命令。
 * 它接受一个命令列表（而不是单个字符串）以避免因路径中存在空格而导致的解析问题。
 * 执行结果通过 CompletableFuture 返回，输出则通过流式消费者处理。
 */
package club.ppmc.idea.util;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class SystemCommandExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger(SystemCommandExecutor.class);

    /**
     * 异步执行一个系统命令，并实时流式传输其标准输出和错误流。
     *
     * @param commandList 要执行的命令及其参数列表 (e.g., ["git", "pull"])。
     * @param workingDirectory 命令执行的工作目录。
     * @param outputConsumer 一个消费者，用于处理命令输出的每一行。
     * @return 一个CompletableFuture，当命令执行完毕时完成，其值为进程的退出码。
     */
    public CompletableFuture<Integer> executeCommand(
            List<String> commandList, File workingDirectory, Consumer<String> outputConsumer) {
        return CompletableFuture.supplyAsync(
                () -> {
                    if (commandList == null || commandList.isEmpty()) {
                        outputConsumer.accept("致命错误: 执行的命令不能为空。");
                        return -1;
                    }
                    try {
                        LOGGER.info(
                                "在目录 {} 中执行命令: {}",
                                workingDirectory.getAbsolutePath(),
                                String.join(" ", commandList));

                        var processBuilder =
                                new ProcessBuilder(commandList)
                                        .directory(workingDirectory)
                                        .redirectErrorStream(true); // 将错误流重定向到标准输出流

                        var process = processBuilder.start();

                        // 使用 try-with-resources 确保 reader 被关闭
                        try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                            reader.lines().forEach(outputConsumer);
                        }

                        int exitCode = process.waitFor();
                        LOGGER.info("命令执行完毕，退出码: {}", exitCode);
                        return exitCode;

                    } catch (IOException | InterruptedException e) {
                        LOGGER.error("执行命令 {} 时出错", commandList, e);
                        outputConsumer.accept("致命错误: 命令执行失败。 " + e.getMessage());
                        if (e instanceof InterruptedException) {
                            Thread.currentThread().interrupt(); // 重新设置中断状态
                        }
                        return -1;
                    }
                });
    }
}