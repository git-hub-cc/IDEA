/**
 * LanguageServerService.java
 *
 * This service is responsible for launching, managing, and communicating with
 * an external Java Language Server (LS) process. It implements LSP4J's LanguageClient
 * interface to receive notifications (like diagnostics) from the LS and forwards
 * them to the frontend via WebSockets.
 */
package com.example.webideabackend.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.lsp4j.*;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.launch.LSPLauncher;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.LanguageServer;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
@Slf4j
public class LanguageServerService implements LanguageClient, DisposableBean {

    @Value("${app.language-server.java-path}")
    private String javaLsPath;

    @Value("${app.workspace-root}")
    private String workspaceRootPath;

    private final WebSocketLogService webSocketLogService;
    private LanguageServer languageServer;
    private Process lsProcess;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private static final String DIAGNOSTICS_TOPIC = "/topic/diagnostics";

    @Autowired
    public LanguageServerService(WebSocketLogService webSocketLogService) {
        this.webSocketLogService = webSocketLogService;
    }

    @PostConstruct
    public void startServer() {
        if (!StringUtils.hasText(javaLsPath)) {
            log.warn("Java Language Server path is not configured. Code completion and diagnostics will be disabled.");
            return;
        }

        executor.submit(() -> {
            try {
                log.info("Starting Java Language Server from path: {}", javaLsPath);
                ProcessBuilder pb = new ProcessBuilder(javaLsPath);
                lsProcess = pb.start();
                log.info("Language Server process started.");

                InputStream in = lsProcess.getInputStream();
                OutputStream out = lsProcess.getOutputStream();

                Launcher<LanguageServer> launcher = LSPLauncher.createClientLauncher(this, in, out);
                this.languageServer = launcher.getRemoteProxy();
                launcher.startListening();

                initialize();

            } catch (IOException e) {
                log.error("Failed to start or connect to the Language Server.", e);
            }
        });
    }

    private void initialize() {
        if (languageServer == null) return;
        try {
            InitializeParams params = new InitializeParams();
            params.setProcessId((int) lsProcess.pid());
            params.setRootUri(Path.of(workspaceRootPath).toUri().toString());
            params.setCapabilities(new ClientCapabilities());
            params.setWorkspaceFolders(Collections.singletonList(new WorkspaceFolder(params.getRootUri(), "workspace")));

            CompletableFuture<InitializeResult> future = languageServer.initialize(params);
            InitializeResult result = future.get();
            languageServer.initialized(new InitializedParams());
            log.info("Language Server initialized. Server capabilities: {}", result.getCapabilities());
        } catch (InterruptedException | ExecutionException e) {
            log.error("Failed to initialize Language Server connection", e);
        }
    }

    // --- File Lifecycle Notifications to LS ---

    public void fileOpened(String filePath, String content) {
        if (languageServer == null) return;
        TextDocumentItem item = new TextDocumentItem(
                Path.of(workspaceRootPath).resolve(filePath).toUri().toString(),
                "java",
                1,
                content
        );
        languageServer.getTextDocumentService().didOpen(new DidOpenTextDocumentParams(item));
        log.debug("Sent didOpen for {}", filePath);
    }

    public void fileChanged(String filePath, String newContent) {
        if (languageServer == null) return;
        TextDocumentContentChangeEvent changeEvent = new TextDocumentContentChangeEvent(newContent);
        VersionedTextDocumentIdentifier identifier = new VersionedTextDocumentIdentifier(Path.of(workspaceRootPath).resolve(filePath).toUri().toString(), 1);
        languageServer.getTextDocumentService().didChange(new DidChangeTextDocumentParams(identifier, Collections.singletonList(changeEvent)));
        log.debug("Sent didChange for {}", filePath);
    }

    public void fileSaved(String filePath) {
        if (languageServer == null) return;
        DidSaveTextDocumentParams params = new DidSaveTextDocumentParams(new TextDocumentIdentifier(Path.of(workspaceRootPath).resolve(filePath).toUri().toString()));
        languageServer.getTextDocumentService().didSave(params);
        log.debug("Sent didSave for {}", filePath);
    }

    // --- Request from Frontend to LS ---

    public CompletableFuture<Either<List<CompletionItem>, CompletionList>> requestCompletion(String filePath, int line, int character) {
        if (languageServer == null) {
            return CompletableFuture.completedFuture(Either.forLeft(Collections.emptyList()));
        }
        CompletionParams params = new CompletionParams(
                new TextDocumentIdentifier(Path.of(workspaceRootPath).resolve(filePath).toUri().toString()),
                new Position(line, character)
        );
        return languageServer.getTextDocumentService().completion(params);
    }

    // =================================================================================
    // LSP NOTIFICATIONS FROM SERVER TO CLIENT (IMPLEMENTATIONS)
    // =================================================================================

    @Override
    public void publishDiagnostics(PublishDiagnosticsParams diagnostics) {
        String relativePath;
        try {
            relativePath = Path.of(workspaceRootPath).relativize(Path.of(URI.create(diagnostics.getUri()))).toString().replace('\\', '/');
        } catch (Exception e) {
            log.warn("Could not relativize path for diagnostics URI: {}", diagnostics.getUri(), e);
            return;
        }
        log.info("Received diagnostics for file: {}", relativePath);
        webSocketLogService.sendMessage(DIAGNOSTICS_TOPIC, diagnostics);
    }

    @Override
    public void showMessage(MessageParams messageParams) {
        log.info("[LS Message]: {} - {}", messageParams.getType(), messageParams.getMessage());
    }

    @Override
    public void logMessage(MessageParams messageParams) {
        log.debug("[LS Log]: {} - {}", messageParams.getType(), messageParams.getMessage());
    }

    // =================================================================================
    // NEWLY ADDED - MISSING METHOD IMPLEMENTATIONS
    // =================================================================================

    /**
     * Handles telemetry events from the language server.
     * We just log it for now.
     */
    @Override
    public void telemetryEvent(Object object) {
        log.debug("[LS Telemetry]: {}", object);
    }

    /**
     * Handles a request from the server to show a message with actions to the client.
     * Since our backend is non-interactive, we cannot prompt a user.
     * We log the request and return a completed future with `null`, indicating no action was taken.
     */
    @Override
    public CompletableFuture<MessageActionItem> showMessageRequest(ShowMessageRequestParams requestParams) {
        log.info("[LS Message Request]: {} - {}", requestParams.getType(), requestParams.getMessage());
        return CompletableFuture.completedFuture(null);
    }

    // =================================================================================

    @Override
    public void destroy() throws Exception {
        if (languageServer != null) {
            try {
                log.info("Shutting down Language Server...");
                languageServer.shutdown().get();
                languageServer.exit();
                log.info("Language Server shut down successfully.");
            } catch (InterruptedException | ExecutionException e) {
                log.error("Error during language server shutdown", e);
            } finally {
                if (lsProcess != null && lsProcess.isAlive()) {
                    lsProcess.destroyForcibly();
                }
                executor.shutdownNow();
            }
        }
    }
}