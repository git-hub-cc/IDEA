package com.example.webideabackend.service;

import com.example.webideabackend.util.SystemCommandExecutor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Paths;
import java.util.concurrent.CompletableFuture;

@Service
public class JavaCompilerRunnerService {

    @Value("${app.workspace-root}")
    private String workspaceRootPath;

    private final SystemCommandExecutor commandExecutor;
    private final WebSocketLogService logService;

    @Autowired
    public JavaCompilerRunnerService(SystemCommandExecutor commandExecutor, WebSocketLogService logService) {
        this.commandExecutor = commandExecutor;
        this.logService = logService;
    }

    /**
     * Executes a Maven build command within a specified project directory.
     *
     * @param projectRelativePath The relative path to the project directory within the workspace.
     * @param mavenCommand        The Maven command to execute (e.g., "mvnw clean install").
     * @return A CompletableFuture that completes with the exit code of the command.
     */
    public CompletableFuture<Integer> runMavenBuild(String projectRelativePath, String mavenCommand) {
        File projectDir = Paths.get(workspaceRootPath, projectRelativePath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            logService.sendMessage("/topic/build-log", errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        // The SystemCommandExecutor will handle OS-specific command wrapping (e.g., cmd /c on Windows).
        logService.sendMessage("/topic/build-log", "Executing: " + mavenCommand + " in " + projectDir.getAbsolutePath());
        return commandExecutor.executeCommand(mavenCommand, projectDir,
                line -> logService.sendMessage("/topic/build-log", line)
        );
    }

    /**
     * Runs a compiled Java application. This method first looks for a standard Maven-produced JAR file.
     * If found, it runs the application using `java -cp <jarfile> <mainClass>`, which is more robust
     * than `java -jar` as it does not depend on the MANIFEST.MF file's Main-Class entry.
     * If no JAR is found, it falls back to running from the `target/classes` directory.
     *
     * @param projectRelativePath The relative path to the project directory within the workspace.
     * @param mainClass           The fully qualified name of the main class (e.g., "com.example.Main").
     * @return A CompletableFuture that completes with the exit code of the application.
     */
    public CompletableFuture<Integer> runJavaApplication(String projectRelativePath, String mainClass) {
        File projectDir = Paths.get(workspaceRootPath, projectRelativePath).toFile();
        if (!projectDir.exists() || !projectDir.isDirectory()) {
            String errorMessage = "Error: Project directory not found: " + projectDir.getAbsolutePath();
            logService.sendMessage("/topic/run-log", errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        File targetDir = new File(projectDir, "target");

        // Construct the expected JAR file name based on artifactId and version from pom.xml (common convention)
        // A more robust solution would be to parse pom.xml, but this covers the standard case.
        String jarFileName = projectDir.getName() + "-1.0-SNAPSHOT.jar";
        File jarFile = new File(targetDir, jarFileName);

        File classesDir = new File(targetDir, "classes");

        String javaCommand;
        // Options to ensure consistent output encoding across platforms
        String javaOpts = "-Dfile.encoding=UTF-8";

        // **Strategy**: Prefer running from JAR using `java -cp`, as it's more reliable.
        if (jarFile.exists()) {
            String classpath = jarFile.getAbsolutePath();
            // **Robust approach**: Use `java -cp` which does not rely on MANIFEST.MF `Main-Class`.
            // This directly specifies the main class to run, avoiding "Main class not found" errors.
            javaCommand = "java " + javaOpts + " -cp \"" + classpath + "\" " + mainClass;
            logService.sendMessage("/topic/run-log", "Running from JAR with explicit main class: " + jarFile.getName());

        } else if (classesDir.exists()) {
            // Fallback strategy: run from the compiled .class files directly.
            String classpath = classesDir.getAbsolutePath();
            javaCommand = "java " + javaOpts + " -cp \"" + classpath + "\" " + mainClass;
            logService.sendMessage("/topic/run-log", "Running from classes directory: " + classesDir.getName());

        } else {
            // If neither JAR nor classes directory is found, report an error.
            String errorMessage = "Error: No compiled JAR (" + jarFileName + ") or classes directory found in 'target'. " +
                    "Please ensure the project has been built successfully with 'mvn clean install'.";
            logService.sendMessage("/topic/run-log", errorMessage);
            return CompletableFuture.completedFuture(-1);
        }

        logService.sendMessage("/topic/run-log", "Executing: " + javaCommand);
        return commandExecutor.executeCommand(javaCommand, projectDir,
                line -> logService.sendMessage("/topic/run-log", line)
        );
    }
}