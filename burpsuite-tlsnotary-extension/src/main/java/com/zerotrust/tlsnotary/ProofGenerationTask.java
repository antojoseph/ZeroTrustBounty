package com.zerotrust.tlsnotary;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.http.message.responses.HttpResponse;
import burp.api.montoya.logging.Logging;

import javax.swing.*;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
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

        String payload = buildProofRequestPayload(req, resp);
        logging.logToOutput("Submitting proof request to TLSNotary API: " + apiUrl + "/prove");
        logging.logToOutput("Target: " + req.httpService().host() + ":" + req.httpService().port());

        updateProgress("Generating TLSNotary proof…", true);
        String response = httpPost(apiUrl + "/prove", payload, config.getTimeoutSeconds());
        return parseProofResponse(response);
    }

    private String buildProofRequestPayload(HttpRequest req, HttpResponse resp) {
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        json.append("  \"notary_host\": \"").append(escape(config.getNotaryHost())).append("\",\n");
        json.append("  \"notary_port\": ").append(config.getNotaryPort()).append(",\n");
        json.append("  \"ca_cert_path\": \"").append(escape(config.getCaCertPath())).append("\",\n");
        json.append("  \"timeout_seconds\": ").append(config.getTimeoutSeconds()).append(",\n");
        json.append("  \"hide_request\": ").append(hideRequest).append(",\n");
        json.append("  \"target_host\": \"").append(escape(req.httpService().host())).append("\",\n");
        json.append("  \"target_port\": ").append(req.httpService().port()).append(",\n");
        json.append("  \"use_tls\": ").append(req.httpService().secure()).append(",\n");

        byte[] reqBytes = req.toByteArray().getBytes();
        json.append("  \"request_b64\": \"")
                .append(Base64.getEncoder().encodeToString(reqBytes))
                .append("\",\n");

        if (resp != null) {
            byte[] respBytes = resp.toByteArray().getBytes();
            json.append("  \"response_b64\": \"")
                    .append(Base64.getEncoder().encodeToString(respBytes))
                    .append("\",\n");
        } else {
            json.append("  \"response_b64\": null,\n");
        }

        json.append("  \"redaction_rules\": [");
        if (redactionRules != null && !redactionRules.isEmpty()) {
            for (int i = 0; i < redactionRules.size(); i++) {
                RedactionRule rule = redactionRules.get(i);
                json.append("\n    {\"type\": \"").append(rule.getType().name()).append("\"");
                if (rule.getValue() != null) {
                    json.append(", \"value\": \"").append(escape(rule.getValue())).append("\"");
                }
                json.append("}");
                if (i < redactionRules.size() - 1) {
                    json.append(",");
                }
            }
            json.append("\n  ");
        }
        json.append("]\n}");

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
                throw new IOException("TLSNotary API returned HTTP " + code + ": " + sb);
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
            JPanel panel = new JPanel(new BorderLayout(8, 8));
            panel.setBorder(BorderFactory.createEmptyBorder(8, 8, 8, 8));

            panel.add(new JLabel(
                    "<html><b>TLSNotary proof generated successfully.</b><br>" +
                    "Presentation: <code>" + savedFiles.presentationPath + "</code><br>" +
                    "Attestation: <code>" + savedFiles.attestationPath + "</code><br>" +
                    "Secrets: <code>" + savedFiles.secretsPath + "</code></html>"),
                    BorderLayout.NORTH);

            String preview = "Server: " + result.serverName + "\n" +
                    "Session: " + result.sessionTime + "\n\n" +
                    "Sent data:\n" + truncateBlock(result.sentData, 1200) + "\n\n" +
                    "Received data:\n" + truncateBlock(result.recvData, 1200);

            JTextArea ta = new JTextArea(preview);
            ta.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 11));
            ta.setEditable(false);
            ta.setRows(16);
            ta.setColumns(60);
            panel.add(new JScrollPane(ta), BorderLayout.CENTER);

            JButton copyBtn = new JButton("Copy Presentation Path");
            copyBtn.addActionListener(e -> {
                java.awt.Toolkit.getDefaultToolkit()
                        .getSystemClipboard()
                        .setContents(new java.awt.datatransfer.StringSelection(savedFiles.presentationPath.toString()), null);
            });
            panel.add(copyBtn, BorderLayout.SOUTH);

            JOptionPane.showMessageDialog(null, panel,
                    "TLSNotary Proof Generated", JOptionPane.INFORMATION_MESSAGE);
        });
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
        String attestationFileName;
        String attestationBase64;
        String secretsFileName;
        String secretsBase64;
    }

    private static class SavedProofFiles {
        Path presentationPath;
        Path attestationPath;
        Path secretsPath;
    }
}
