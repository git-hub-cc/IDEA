/**
 * SystemCommandExecutor.java
 *
 * 这是一个工具类，负责以跨平台的方式安全地执行外部系统命令。
 * 它现在接受一个命令列表，以避免路径中存在空格导致的问题。
 */
package com.example.webideabackend.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

@Component
public class SystemCommandExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger(SystemCommandExecutor.class);

    /**
     * 异步执行一个系统命令并流式传输其标准输出和错误流。
     *
     * @param commandList      要执行的命令及其参数列表。
     * @param workingDirectory 命令执行的工作目录。
     * @param outputConsumer   一个消费者，用于处理命令输出的每一行。
     * @return 一个CompletableFuture，当命令执行完毕时完成，其值为进程的退出码。
     */
    public CompletableFuture<Integer> executeCommand(List<String> commandList, File workingDirectory, Consumer<String> outputConsumer) {
        return CompletableFuture.supplyAsync(() -> {
            if (commandList == null || commandList.isEmpty()) {
                outputConsumer.accept("FATAL: Command cannot be empty.");
                return -1;
            }
            try {
                LOGGER.info("Executing command: {} in directory: {}", commandList, workingDirectory.getAbsolutePath());

                var processBuilder = new ProcessBuilder(commandList)
                        .directory(workingDirectory)
                        .redirectErrorStream(true); // 将错误流重定向到标准输出流

                var process = processBuilder.start();

                try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    reader.lines().forEach(outputConsumer);
                }

                int exitCode = process.waitFor();
                LOGGER.info("Command finished with exit code: {}", exitCode);
                return exitCode;

            } catch (IOException | InterruptedException e) {
                LOGGER.error("Error executing command: {}", commandList, e);
                outputConsumer.accept("FATAL: Command execution failed. " + e.getMessage());
                if (e instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return -1;
            }
        });
    }
}