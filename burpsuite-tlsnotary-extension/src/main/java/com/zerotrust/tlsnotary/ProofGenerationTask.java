package com.zerotrust.tlsnotary;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.http.message.responses.HttpResponse;
import burp.api.montoya.logging.Logging;

import javax.swing.*;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Desktop;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.Transferable;
import java.awt.datatransfer.UnsupportedFlavorException;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Background {@link Runnable} that:
 *  1. Serialises the current Repeater request/response into a JSON payload.
 *  2. POSTs it to the dockerized TLSNotary HTTP API.
 *  3. Receives attestation / secrets / presentation artifacts in one response.
 *  4. Saves those artifacts to the configured output directory.
 *  5. Shows a result dialog to the user.
 */
public class ProofGenerationTask implements Runnable {
    private static final String TLSN_CLIPBOARD_PREFIX = "tlsn-presentation-v1:";

    private final MontoyaApi api;
    private final TLSNotaryConfig config;
    private final Logging logging;
    private final HttpRequestResponse reqRes;
    private final boolean hideRequest;
    private final List<RedactionRule> redactionRules;

    private JDialog progressDialog;
    private JLabel progressLabel;
    private JProgressBar progressBar;

    public ProofGenerationTask(MontoyaApi api,
                               TLSNotaryConfig config,
                               Logging logging,
                               HttpRequestResponse reqRes,
                               boolean hideRequest,
                               List<RedactionRule> redactionRules) {
        this.api = api;
        this.config = config;
        this.logging = logging;
        this.reqRes = reqRes;
        this.hideRequest = hideRequest;
        this.redactionRules = redactionRules;
    }

    @Override
    public void run() {
        showProgress("Connecting to TLSNotary API…");
        try {
            ProofGenerationResult result = generateProof();
            SavedProofFiles savedFiles = saveProofFiles(result);
            hideProgress();
            showSuccess(savedFiles, result);
        } catch (Exception ex) {
            hideProgress();
            logging.logToError("Proof generation failed: " + ex.getMessage());
            showError(ex.getMessage());
        }
    }

    private ProofGenerationResult generateProof() throws IOException {
        HttpRequest req = reqRes.request();
        HttpResponse resp = reqRes.response();
        String apiUrl = config.getApiUrl();

        if (!req.httpService().secure()) {
            throw new IOException(
                    "TLSNotary proofs require an HTTPS request. The selected request targets "
                            + req.httpService().host()
                            + ":"
                            + req.httpService().port()
                            + " over plain HTTP."
            );
        }

        String payload = buildProofRequestPayload(req, resp);
        logging.logToOutput("Submitting proof request to TLSNotary API: " + apiUrl + "/prove");
        logging.logToOutput("Target: " + req.httpService().host() + ":" + req.httpService().port());

        updateProgress("Generating TLSNotary proof…", true);
        String response = httpPost(apiUrl + "/prove", payload, config.getTimeoutSeconds());
        return parseProofResponse(response);
    }

    private String buildProofRequestPayload(HttpRequest req, HttpResponse resp) {
        List<String> fields = new ArrayList<>();

        if (config.shouldUseNotaryOverrides()) {
            String notaryHost = config.getNotaryHost().trim();
            if (!notaryHost.isEmpty()) {
                fields.add("  \"notary_host\": \"" + escape(notaryHost) + "\"");
            }

            int notaryPort = config.getNotaryPort();
            if (notaryPort > 0) {
                fields.add("  \"notary_port\": " + notaryPort);
            }

            String caCertPath = config.getCaCertPath().trim();
            if (!caCertPath.isEmpty()) {
                fields.add("  \"ca_cert_path\": \"" + escape(caCertPath) + "\"");
            }
        }

        fields.add("  \"timeout_seconds\": " + config.getTimeoutSeconds());
        fields.add("  \"hide_request\": " + hideRequest);
        fields.add("  \"target_host\": \"" + escape(req.httpService().host()) + "\"");
        fields.add("  \"target_port\": " + req.httpService().port());
        fields.add("  \"use_tls\": " + req.httpService().secure());

        byte[] reqBytes = req.toByteArray().getBytes();
        fields.add("  \"request_b64\": \"" + Base64.getEncoder().encodeToString(reqBytes) + "\"");

        if (resp != null) {
            byte[] respBytes = resp.toByteArray().getBytes();
            fields.add("  \"response_b64\": \"" + Base64.getEncoder().encodeToString(respBytes) + "\"");
        } else {
            fields.add("  \"response_b64\": null");
        }

        StringBuilder redactionRulesJson = new StringBuilder();
        redactionRulesJson.append("  \"redaction_rules\": [");
        if (redactionRules != null && !redactionRules.isEmpty()) {
            for (int i = 0; i < redactionRules.size(); i++) {
                RedactionRule rule = redactionRules.get(i);
                redactionRulesJson.append("\n    {\"type\": \"").append(rule.getType().name()).append("\"");
                if (rule.getValue() != null) {
                    redactionRulesJson.append(", \"value\": \"").append(escape(rule.getValue())).append("\"");
                }
                redactionRulesJson.append("}");
                if (i < redactionRules.size() - 1) {
                    redactionRulesJson.append(",");
                }
            }
            redactionRulesJson.append("\n  ");
        }
        redactionRulesJson.append("]");
        fields.add(redactionRulesJson.toString());

        StringBuilder json = new StringBuilder();
        json.append("{\n");
        for (int i = 0; i < fields.size(); i++) {
            json.append(fields.get(i));
            if (i < fields.size() - 1) {
                json.append(",\n");
            } else {
                json.append('\n');
            }
        }
        json.append("}");

        return json.toString();
    }

    private ProofGenerationResult parseProofResponse(String json) throws IOException {
        String status = extractJsonString(json, "status");
        if (!"completed".equalsIgnoreCase(status)) {
            String err = extractJsonString(json, "error");
            if (err == null || err.isEmpty()) {
                err = "TLSNotary API did not return a completed proof response";
            }
            throw new IOException(err);
        }

        ProofGenerationResult result = new ProofGenerationResult();
        result.serverName = requireJsonValue(json, "server_name");
        result.sessionTime = requireJsonValue(json, "session_time");
        result.sentData = requireJsonValue(json, "sent_data");
        result.recvData = requireJsonValue(json, "recv_data");
        result.presentationFileName = requireJsonValue(json, "presentation_file_name");
        result.presentationBase64 = requireJsonValue(json, "presentation_b64");
        String fullPresentationFileName = extractJsonString(json, "full_presentation_file_name");
        if (fullPresentationFileName != null && !fullPresentationFileName.isBlank()) {
            result.fullPresentationFileName = fullPresentationFileName;
        }
        String fullPresentationBase64 = extractJsonString(json, "full_presentation_b64");
        if (fullPresentationBase64 != null && !fullPresentationBase64.isBlank()) {
            result.fullPresentationBase64 = fullPresentationBase64;
        }
        result.attestationFileName = requireJsonValue(json, "attestation_file_name");
        result.attestationBase64 = requireJsonValue(json, "attestation_b64");
        result.secretsFileName = requireJsonValue(json, "secrets_file_name");
        result.secretsBase64 = requireJsonValue(json, "secrets_b64");
        return result;
    }

    private SavedProofFiles saveProofFiles(ProofGenerationResult result) throws IOException {
        Path outDir = Paths.get(config.getOutputDir());
        Files.createDirectories(outDir);

        SavedProofFiles saved = new SavedProofFiles();
        saved.presentationPath = writeArtifact(
                outDir,
                result.presentationFileName,
                result.presentationBase64,
                "proof.presentation.tlsn"
        );
        if (result.fullPresentationBase64 != null && !result.fullPresentationBase64.isBlank()) {
            saved.fullPresentationPath = writeArtifact(
                    outDir,
                    result.fullPresentationFileName,
                    result.fullPresentationBase64,
                    "proof.full.presentation.tlsn"
            );
        }
        saved.attestationPath = writeArtifact(
                outDir,
                result.attestationFileName,
                result.attestationBase64,
                "proof.attestation.tlsn"
        );
        saved.secretsPath = writeArtifact(
                outDir,
                result.secretsFileName,
                result.secretsBase64,
                "proof.secrets.tlsn"
        );

        logging.logToOutput("Presentation saved to: " + saved.presentationPath);
        if (saved.fullPresentationPath != null) {
            logging.logToOutput("Full presentation saved to: " + saved.fullPresentationPath);
        }
        logging.logToOutput("Attestation saved to: " + saved.attestationPath);
        logging.logToOutput("Secrets saved to: " + saved.secretsPath);

        return saved;
    }

    private Path writeArtifact(Path outDir,
                               String suggestedFileName,
                               String base64,
                               String fallbackFileName) throws IOException {
        String fileName = sanitizeFileName(suggestedFileName, fallbackFileName);
        Path path = outDir.resolve(fileName);
        Files.write(path, Base64.getDecoder().decode(base64));
        return path;
    }

    private static String sanitizeFileName(String fileName, String fallback) {
        if (fileName == null || fileName.isBlank()) {
            return fallback;
        }
        return Paths.get(fileName).getFileName().toString();
    }

    private String httpPost(String urlStr, String body, int timeoutSeconds) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(Math.max(30_000, (timeoutSeconds + 30) * 1_000));
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        return readResponse(conn);
    }

    private String readResponse(HttpURLConnection conn) throws IOException {
        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) {
            throw new IOException("Empty response from TLSNotary API (HTTP " + code + ")");
        }
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append('\n');
            }
            if (code < 200 || code >= 300) {
                String responseBody = sb.toString();
                String error = extractJsonString(responseBody, "error");
                String details = extractJsonString(responseBody, "details");
                if (details != null && !details.isBlank()) {
                    if (error != null && !error.isBlank()) {
                        throw new IOException(error + ": " + details);
                    }
                    throw new IOException(details);
                }
                throw new IOException("TLSNotary API returned HTTP " + code + ": " + responseBody);
            }
            return sb.toString();
        }
    }

    static String extractJsonString(String json, String key) {
        String searchKey = "\"" + key + "\"";
        int idx = json.indexOf(searchKey);
        if (idx < 0) return "";
        int colon = json.indexOf(':', idx + searchKey.length());
        if (colon < 0) return "";
        int start = colon + 1;
        while (start < json.length() && Character.isWhitespace(json.charAt(start))) start++;
        if (start >= json.length()) return "";
        char first = json.charAt(start);
        if (first == '"') {
            StringBuilder sb = new StringBuilder();
            int i = start + 1;
            while (i < json.length()) {
                char c = json.charAt(i);
                if (c == '\\' && i + 1 < json.length()) {
                    char next = json.charAt(i + 1);
                    switch (next) {
                        case '"': sb.append('"'); i += 2; continue;
                        case '\\': sb.append('\\'); i += 2; continue;
                        case 'n': sb.append('\n'); i += 2; continue;
                        case 'r': sb.append('\r'); i += 2; continue;
                        case 't': sb.append('\t'); i += 2; continue;
                    }
                }
                if (c == '"') break;
                sb.append(c);
                i++;
            }
            return sb.toString();
        }
        if (json.startsWith("null", start)) return null;
        int end = start;
        while (end < json.length() && !Character.isWhitespace(json.charAt(end))
                && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
        return json.substring(start, end);
    }

    private static String requireJsonValue(String json, String key) throws IOException {
        String value = extractJsonString(json, key);
        if (value == null || value.isEmpty()) {
            throw new IOException("Missing field in TLSNotary API response: " + key);
        }
        return value;
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }

    private void showProgress(String message) {
        SwingUtilities.invokeLater(() -> {
            progressDialog = new JDialog();
            progressDialog.setTitle("TLSNotary – Generating Proof");
            progressDialog.setDefaultCloseOperation(JDialog.DO_NOTHING_ON_CLOSE);
            progressDialog.setModal(false);

            JPanel panel = new JPanel(new BorderLayout(8, 8));
            panel.setBorder(BorderFactory.createEmptyBorder(16, 20, 16, 20));

            progressLabel = new JLabel(message);
            panel.add(progressLabel, BorderLayout.NORTH);

            progressBar = new JProgressBar();
            progressBar.setIndeterminate(true);
            progressBar.setPreferredSize(new Dimension(380, 20));
            panel.add(progressBar, BorderLayout.CENTER);

            JLabel hint = new JLabel(
                    "<html><small>TLSNotary proof generation is running inside the dockerized API service.</small></html>");
            panel.add(hint, BorderLayout.SOUTH);

            progressDialog.add(panel);
            progressDialog.pack();
            progressDialog.setLocationRelativeTo(null);
            progressDialog.setVisible(true);
        });
    }

    private void updateProgress(String message, boolean indeterminate) {
        SwingUtilities.invokeLater(() -> {
            if (progressLabel != null) progressLabel.setText(message);
            if (progressBar != null) progressBar.setIndeterminate(indeterminate);
        });
    }

    private void hideProgress() {
        SwingUtilities.invokeLater(() -> {
            if (progressDialog != null) {
                progressDialog.dispose();
                progressDialog = null;
            }
        });
    }

    private void showSuccess(SavedProofFiles savedFiles, ProofGenerationResult result) {
        SwingUtilities.invokeLater(() -> {
            JDialog dialog = new JDialog((java.awt.Frame) null, "TLSNotary Proof Generated", true);
            dialog.setDefaultCloseOperation(JDialog.DISPOSE_ON_CLOSE);

            JPanel panel = new JPanel(new BorderLayout(10, 10));
            panel.setBorder(BorderFactory.createEmptyBorder(12, 12, 12, 12));

            panel.add(new JLabel(
                    "<html><b>TLSNotary proof generated successfully.</b><br>" +
                    "Artifacts were saved locally and can be reviewed below.</html>"),
                    BorderLayout.NORTH);

            JPanel content = new JPanel(new BorderLayout(8, 8));

            StringBuilder artifactsText = new StringBuilder();
            artifactsText.append("Presentation:\n").append(savedFiles.presentationPath);
            if (savedFiles.fullPresentationPath != null) {
                artifactsText.append("\n\nFull Presentation:\n").append(savedFiles.fullPresentationPath);
            }
            artifactsText.append("\n\nAttestation:\n").append(savedFiles.attestationPath)
                    .append("\n\nSecrets:\n").append(savedFiles.secretsPath);

            JTextArea artifactsArea = new JTextArea(artifactsText.toString());
            artifactsArea.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 11));
            artifactsArea.setEditable(false);
            artifactsArea.setLineWrap(true);
            artifactsArea.setWrapStyleWord(false);
            artifactsArea.setRows(savedFiles.fullPresentationPath != null ? 9 : 7);
            artifactsArea.setColumns(56);
            artifactsArea.setCaretPosition(0);

            JScrollPane artifactsScroll = new JScrollPane(artifactsArea);
            artifactsScroll.setBorder(BorderFactory.createTitledBorder("Artifacts"));
            artifactsScroll.setPreferredSize(new Dimension(560, 150));
            content.add(artifactsScroll, BorderLayout.NORTH);

            String preview = "Server: " + result.serverName + "\n" +
                    "Session: " + result.sessionTime + "\n\n" +
                    "Sent data:\n" + truncateBlock(result.sentData, 1200) + "\n\n" +
                    "Received data:\n" + truncateBlock(result.recvData, 1200);

            JTextArea ta = new JTextArea(preview);
            ta.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 11));
            ta.setEditable(false);
            ta.setRows(14);
            ta.setColumns(56);
            ta.setCaretPosition(0);

            JScrollPane previewScroll = new JScrollPane(ta);
            previewScroll.setBorder(BorderFactory.createTitledBorder("Transcript Preview"));
            previewScroll.setPreferredSize(new Dimension(560, 260));
            content.add(previewScroll, BorderLayout.CENTER);

            if (savedFiles.fullPresentationPath != null) {
                JLabel companionHint = new JLabel(
                        "<html><small>A companion full presentation from the same notarized session was also saved. Use that file if a platform later asks you to reveal the hidden request details.</small></html>"
                );
                content.add(companionHint, BorderLayout.SOUTH);
            }

            panel.add(content, BorderLayout.CENTER);

            JPanel actions = new JPanel(new java.awt.FlowLayout(java.awt.FlowLayout.RIGHT, 8, 0));

            JButton copyBtn = new JButton("Copy Proof to Clipboard");
            copyBtn.addActionListener(e -> {
                copyPresentationToClipboard(savedFiles.presentationPath, result);
                copyBtn.setText("Proof Copied");
            });

            JButton openFolderBtn = new JButton("Open Proof Folder");
            openFolderBtn.addActionListener(e -> {
                try {
                    openProofFolder(savedFiles.presentationPath);
                } catch (IOException ex) {
                    showError("Failed to open proof folder: " + ex.getMessage());
                }
            });

            JButton closeBtn = new JButton("Close");
            closeBtn.addActionListener(e -> dialog.dispose());

            actions.add(copyBtn);
            actions.add(openFolderBtn);
            actions.add(closeBtn);
            panel.add(actions, BorderLayout.SOUTH);

            dialog.setContentPane(panel);
            dialog.pack();
            dialog.setSize(new Dimension(640, 540));
            dialog.setMinimumSize(new Dimension(600, 480));
            dialog.setLocationRelativeTo(null);
            dialog.setVisible(true);
        });
    }

    private void copyPresentationToClipboard(Path presentationPath, ProofGenerationResult result) {
        java.awt.Toolkit.getDefaultToolkit()
                .getSystemClipboard()
                .setContents(
                        new ProofClipboardTransferable(
                                presentationPath,
                                result.presentationFileName,
                                result.presentationBase64
                        ),
                        null
                );
    }

    private void openProofFolder(Path presentationPath) throws IOException {
        Path folder = presentationPath.getParent();
        if (folder == null) {
            throw new IOException("proof folder could not be resolved");
        }

        if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
            Desktop.getDesktop().open(folder.toFile());
            return;
        }

        new ProcessBuilder("open", folder.toString()).start();
    }

    private static String truncateBlock(String text, int maxChars) {
        if (text == null) return "";
        return text.length() <= maxChars ? text : text.substring(0, maxChars) + "\n…[truncated]";
    }

    private void showError(String message) {
        SwingUtilities.invokeLater(() ->
                JOptionPane.showMessageDialog(null,
                        "<html><b>Proof generation failed:</b><br>" + message + "<br><br>" +
                        "<small>Ensure the dockerized TLSNotary API is running and reachable from BurpSuite.<br>" +
                        "Check the Extensions → Output tab for details.</small></html>",
                        "TLSNotary Error", JOptionPane.ERROR_MESSAGE));
    }

    private static class ProofGenerationResult {
        String serverName;
        String sessionTime;
        String sentData;
        String recvData;
        String presentationFileName;
        String presentationBase64;
        String fullPresentationFileName;
        String fullPresentationBase64;
        String attestationFileName;
        String attestationBase64;
        String secretsFileName;
        String secretsBase64;
    }

    private static class SavedProofFiles {
        Path presentationPath;
        Path fullPresentationPath;
        Path attestationPath;
        Path secretsPath;
    }

    private static class ProofClipboardTransferable implements Transferable {
        private static final DataFlavor[] SUPPORTED_FLAVORS = {
                DataFlavor.javaFileListFlavor,
                DataFlavor.stringFlavor
        };

        private final Path presentationPath;
        private final String presentationFileName;
        private final String presentationBase64;

        private ProofClipboardTransferable(
                Path presentationPath,
                String presentationFileName,
                String presentationBase64
        ) {
            this.presentationPath = presentationPath;
            this.presentationFileName = presentationFileName;
            this.presentationBase64 = presentationBase64;
        }

        @Override
        public DataFlavor[] getTransferDataFlavors() {
            return SUPPORTED_FLAVORS.clone();
        }

        @Override
        public boolean isDataFlavorSupported(DataFlavor flavor) {
            return DataFlavor.javaFileListFlavor.equals(flavor) || DataFlavor.stringFlavor.equals(flavor);
        }

        @Override
        public Object getTransferData(DataFlavor flavor) throws UnsupportedFlavorException {
            if (DataFlavor.javaFileListFlavor.equals(flavor)) {
                return List.of(presentationPath.toFile());
            }
            if (DataFlavor.stringFlavor.equals(flavor)) {
                return TLSN_CLIPBOARD_PREFIX
                        + "{\"fileName\":\""
                        + escape(presentationFileName)
                        + "\",\"mimeType\":\"application/octet-stream\",\"base64\":\""
                        + presentationBase64
                        + "\"}";
            }
            throw new UnsupportedFlavorException(flavor);
        }
    }
}
