package com.example.webideabackend.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component; // 确保导入
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

// --- 关键改动：添加 @Component 注解 ---
@Component
public class SystemCommandExecutor {

    private static final Logger logger = LoggerFactory.getLogger(SystemCommandExecutor.class);

    /**
     * Executes a system command and streams its output.
     *
     * @param command The command to execute (e.g., "mvn clean install").
     * @param workingDirectory The directory where the command should be executed.
     * @param outputConsumer A consumer to process each line of the command's output.
     * @return A CompletableFuture that completes when the command finishes, containing the exit code.
     */
    public CompletableFuture<Integer> executeCommand(String command, File workingDirectory, Consumer<String> outputConsumer) {
        return CompletableFuture.supplyAsync(() -> {
            Process process = null;
            BufferedReader reader = null;
            try {
                // Determine OS and adjust command
                String[] cmdArray;
                boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");

                if (isWindows) {
                    // On Windows, use cmd /c. Split the command string correctly.
                    // Example: "mvnw clean install" -> ["cmd.exe", "/c", "mvnw.cmd", "clean", "install"]
                    String baseCommand = command.split(" ")[0];
                    if (baseCommand.equals("mvnw") || baseCommand.equals("gradlew")) {
                        // The command itself will be mvnw.cmd, followed by args
                        cmdArray = command.replaceFirst(baseCommand, baseCommand + ".cmd").split(" ");
                        cmdArray = new String[]{"cmd.exe", "/c", String.join(" ", cmdArray)};
                    } else {
                        cmdArray = command.split(" ");
                    }
                } else {
                    // On Unix-like systems
                    String baseCommand = command.split(" ")[0];
                    if (baseCommand.startsWith("./")) { // if already has ./
                        cmdArray = command.split(" ");
                    } else if (baseCommand.equals("mvnw") || baseCommand.equals("gradlew")) {
                        // Prepend ./ to wrapper scripts
                        cmdArray = command.replaceFirst(baseCommand, "./" + baseCommand).split(" ");
                    }
                    else {
                        cmdArray = command.split(" ");
                    }
                }

                logger.info("Executing command array: {} in directory: {}", Arrays.toString(cmdArray), workingDirectory.getAbsolutePath());

                ProcessBuilder pb = new ProcessBuilder(cmdArray);
                pb.directory(workingDirectory);
                pb.redirectErrorStream(true); // Redirect error stream to standard output stream

                process = pb.start();
                reader = new BufferedReader(new InputStreamReader(process.getInputStream()));

                String line;
                while ((line = reader.readLine()) != null) {
                    outputConsumer.accept(line); // Pass each line to the consumer
                }

                int exitCode = process.waitFor();
                logger.info("Command exited with code: {}", exitCode);
                return exitCode;

            } catch (IOException | InterruptedException e) {
                logger.error("Error executing command: " + command, e);
                outputConsumer.accept("Error executing command: " + e.getMessage());
                Thread.currentThread().interrupt(); // Restore interrupted status
                return -1; // Indicate an error
            } finally {
                if (reader != null) {
                    try {
                        reader.close();
                    } catch (IOException e) {
                        logger.warn("Error closing reader", e);
                    }
                }
                if (process != null) {
                    process.destroy(); // Ensure process is terminated
                }
            }
        });
    }
}