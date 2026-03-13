package com.zerotrust.tlsnotary;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;
import burp.api.montoya.http.message.responses.HttpResponse;
import burp.api.montoya.logging.Logging;

import javax.swing.*;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.Font;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;

/**
 * Background {@link Runnable} that:
 *  1. Serialises the current Repeater request/response into a JSON payload.
 *  2. POSTs it to the TLSNotary bridge service.
 *  3. Polls for the result (the bridge returns a job ID immediately).
 *  4. Saves the proof JSON to the configured output directory.
 *  5. Shows a result dialog to the user.
 */
public class ProofGenerationTask implements Runnable {

    private static final int POLL_INTERVAL_MS = 3_000;
    private static final DateTimeFormatter TS_FMT =
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    private final MontoyaApi api;
    private final TLSNotaryConfig config;
    private final Logging logging;
    private final HttpRequestResponse reqRes;
    private final boolean hideRequest;
    private final List<RedactionRule> redactionRules;

    // Progress dialog (Swing – must be touched only on EDT)
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
        showProgress("Connecting to TLSNotary bridge…");
        try {
            String jobId = submitJob();
            updateProgress("Job submitted (id=" + jobId + "). Waiting for proof…", true);
            String proofJson = pollForResult(jobId);
            String proofPath = saveProof(proofJson);
            hideProgress();
            showSuccess(proofPath, proofJson);
        } catch (Exception ex) {
            hideProgress();
            logging.logToError("Proof generation failed: " + ex.getMessage());
            showError(ex.getMessage());
        }
    }

    // ── Bridge communication ──────────────────────────────────────────────────

    /**
     * POSTs the notarization request to the bridge and returns the job ID.
     */
    private String submitJob() throws IOException {
        HttpRequest req = reqRes.request();
        HttpResponse resp = reqRes.response();

        // Build JSON payload
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        json.append("  \"notary_host\": \"").append(escape(config.getNotaryHost())).append("\",\n");
        json.append("  \"notary_port\": ").append(config.getNotaryPort()).append(",\n");
        json.append("  \"ca_cert_path\": \"").append(escape(config.getCaCertPath())).append("\",\n");
        json.append("  \"output_dir\": \"").append(escape(config.getOutputDir())).append("\",\n");
        json.append("  \"hide_request\": ").append(hideRequest).append(",\n");
        json.append("  \"timeout_seconds\": ").append(config.getTimeoutSeconds()).append(",\n");

        // Target server extracted from request host header
        String host = req.headerValue("Host");
        if (host == null || host.isEmpty()) {
            host = req.httpService().host();
        }
        json.append("  \"target_host\": \"").append(escape(host)).append("\",\n");
        json.append("  \"target_port\": ").append(req.httpService().port()).append(",\n");
        json.append("  \"use_tls\": ").append(req.httpService().secure()).append(",\n");

        // Full request bytes (base64)
        byte[] reqBytes = req.toByteArray().getBytes();
        json.append("  \"request_b64\": \"").append(Base64.getEncoder().encodeToString(reqBytes)).append("\",\n");

        // Response bytes if available (for reference / verification display)
        if (resp != null) {
            byte[] respBytes = resp.toByteArray().getBytes();
            json.append("  \"response_b64\": \"").append(Base64.getEncoder().encodeToString(respBytes)).append("\",\n");
        } else {
            json.append("  \"response_b64\": null,\n");
        }

        // Redaction rules
        json.append("  \"redaction_rules\": [");
        if (redactionRules != null && !redactionRules.isEmpty()) {
            for (int i = 0; i < redactionRules.size(); i++) {
                RedactionRule rule = redactionRules.get(i);
                json.append("\n    {\"type\": \"").append(rule.getType().name()).append("\"");
                if (rule.getValue() != null) {
                    json.append(", \"value\": \"").append(escape(rule.getValue())).append("\"");
                }
                json.append("}");
                if (i < redactionRules.size() - 1) json.append(",");
            }
            json.append("\n  ");
        }
        json.append("]\n}");

        logging.logToOutput("Submitting job to bridge: " + config.getBridgeUrl() + "/generate-proof");
        logging.logToOutput("Target: " + host + ":" + req.httpService().port());

        String response = httpPost(config.getBridgeUrl() + "/generate-proof", json.toString());

        // Extract job_id from simple JSON response
        return extractJsonString(response, "job_id");
    }

    /**
     * Polls GET /proof-status/{jobId} until status = "completed" or "failed".
     */
    private String pollForResult(String jobId) throws IOException, InterruptedException {
        long deadline = System.currentTimeMillis() + (long) config.getTimeoutSeconds() * 1_000;
        int attempt = 0;

        while (System.currentTimeMillis() < deadline) {
            attempt++;
            updateProgress("Waiting for proof (attempt " + attempt + ")…", true);

            String statusResponse = httpGet(config.getBridgeUrl() + "/proof-status/" + jobId);
            String status = extractJsonString(statusResponse, "status");

            if ("completed".equalsIgnoreCase(status)) {
                return extractJsonString(statusResponse, "proof_json");
            }
            if ("failed".equalsIgnoreCase(status)) {
                String err = extractJsonString(statusResponse, "error");
                throw new IOException("Proof generation failed: " + err);
            }

            Thread.sleep(POLL_INTERVAL_MS);
        }

        throw new IOException("Proof generation timed out after " + config.getTimeoutSeconds() + "s");
    }

    /**
     * Saves the proof JSON to the output directory.
     */
    private String saveProof(String proofJson) throws IOException {
        Path outDir = Paths.get(config.getOutputDir());
        Files.createDirectories(outDir);

        String filename = "proof_" + LocalDateTime.now().format(TS_FMT) + ".json";
        Path proofPath = outDir.resolve(filename);
        Files.writeString(proofPath, proofJson, StandardCharsets.UTF_8);

        logging.logToOutput("Proof saved to: " + proofPath);
        return proofPath.toString();
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    private String httpPost(String urlStr, String body) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(30_000);
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        return readResponse(conn);
    }

    private String httpGet(String urlStr) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(15_000);
        return readResponse(conn);
    }

    private String readResponse(HttpURLConnection conn) throws IOException {
        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) throw new IOException("Empty response from bridge (HTTP " + code + ")");
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append('\n');
            if (code < 200 || code >= 300) {
                throw new IOException("Bridge returned HTTP " + code + ": " + sb);
            }
            return sb.toString();
        }
    }

    // ── Minimal JSON extractor (avoids adding a JSON lib dependency) ──────────

    /**
     * Extracts a string value for a given key from a flat JSON object.
     * Handles both quoted strings and null values.
     */
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
        // number / boolean
        int end = start;
        while (end < json.length() && !Character.isWhitespace(json.charAt(end))
                && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
        return json.substring(start, end);
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }

    // ── Progress / result dialogs (EDT) ───────────────────────────────────────

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
                    "<html><small>TLSNotary MPC protocol in progress. This may take 30–120 seconds.</small></html>");
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

    private void showSuccess(String proofPath, String proofJson) {
        SwingUtilities.invokeLater(() -> {
            JPanel panel = new JPanel(new BorderLayout(8, 8));
            panel.setBorder(BorderFactory.createEmptyBorder(8, 8, 8, 8));

            panel.add(new JLabel(
                    "<html><b>TLSNotary proof generated successfully!</b><br>" +
                    "Saved to: <code>" + proofPath + "</code></html>"),
                    BorderLayout.NORTH);

            JTextArea ta = new JTextArea(proofJson.length() > 2000
                    ? proofJson.substring(0, 2000) + "\n…[truncated]" : proofJson);
            ta.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 11));
            ta.setEditable(false);
            ta.setRows(14);
            ta.setColumns(60);
            panel.add(new JScrollPane(ta), BorderLayout.CENTER);

            JButton copyBtn = new JButton("Copy Path");
            copyBtn.addActionListener(e -> {
                java.awt.Toolkit.getDefaultToolkit()
                        .getSystemClipboard()
                        .setContents(new java.awt.datatransfer.StringSelection(proofPath), null);
            });
            panel.add(copyBtn, BorderLayout.SOUTH);

            JOptionPane.showMessageDialog(null, panel,
                    "TLSNotary Proof Generated", JOptionPane.INFORMATION_MESSAGE);
        });
    }

    private void showError(String message) {
        SwingUtilities.invokeLater(() ->
                JOptionPane.showMessageDialog(null,
                        "<html><b>Proof generation failed:</b><br>" + message + "<br><br>" +
                        "<small>Ensure the TLSNotary bridge service is running and configured correctly.<br>" +
                        "Check the Extensions → Output tab for details.</small></html>",
                        "TLSNotary Error", JOptionPane.ERROR_MESSAGE));
    }
}
