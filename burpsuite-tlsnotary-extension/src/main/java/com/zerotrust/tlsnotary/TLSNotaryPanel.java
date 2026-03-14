package com.zerotrust.tlsnotary;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.logging.Logging;

import javax.swing.*;
import javax.swing.border.TitledBorder;
import java.awt.*;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * BurpSuite suite tab for configuring the TLSNotary extension.
 *
 * Settings are persisted in BurpSuite's extension preferences store via
 * {@link TLSNotaryConfig} so they survive project reloads and restarts.
 */
public class TLSNotaryPanel extends JPanel {

    private final MontoyaApi api;
    private final TLSNotaryConfig config;
    private final Logging logging;

    // Fields
    private JTextField txtApiUrl;
    private JTextField txtNotaryHost;
    private JTextField txtNotaryPort;
    private JTextField txtCaCertPath;
    private JTextField txtOutputDir;
    private JSpinner   spnTimeout;
    private JCheckBox  chkHideByDefault;
    private JLabel     lblStatus;

    public TLSNotaryPanel(MontoyaApi api, TLSNotaryConfig config, Logging logging) {
        this.api = api;
        this.config = config;
        this.logging = logging;
        buildUI();
        loadValues();
    }

    private void buildUI() {
        setLayout(new BorderLayout(8, 8));
        setBorder(BorderFactory.createEmptyBorder(12, 12, 12, 12));

        // ── Header ────────────────────────────────────────────────────────────
        JPanel header = new JPanel(new BorderLayout());
        JLabel title = new JLabel(
                "<html><h2 style='margin:0'>TLSNotary Proof Generator</h2>" +
                "<p style='color:gray;margin:2px 0 0 0'>Generate cryptographic TLSNotary proofs directly from BurpSuite Repeater</p></html>");
        header.add(title, BorderLayout.CENTER);
        add(header, BorderLayout.NORTH);

        // ── Main config form ──────────────────────────────────────────────────
        JPanel form = new JPanel(new GridBagLayout());
        GridBagConstraints gc = new GridBagConstraints();
        gc.insets = new Insets(4, 4, 4, 4);
        gc.fill = GridBagConstraints.HORIZONTAL;

        // TLSNotary API section
        JPanel bridgePanel = new JPanel(new GridBagLayout());
        bridgePanel.setBorder(new TitledBorder("TLSNotary API Service (dockerized companion)"));
        GridBagConstraints bg = new GridBagConstraints();
        bg.insets = new Insets(3, 6, 3, 6);
        bg.fill = GridBagConstraints.HORIZONTAL;

        bg.gridx = 0; bg.gridy = 0; bg.weightx = 0;
        bridgePanel.add(new JLabel("API URL:"), bg);
        bg.gridx = 1; bg.weightx = 1.0;
        txtApiUrl = new JTextField(30);
        bridgePanel.add(txtApiUrl, bg);
        bg.gridx = 2; bg.weightx = 0;
        JButton btnTest = new JButton("Test Connection");
        btnTest.addActionListener(e -> testApiConnection());
        bridgePanel.add(btnTest, bg);

        bg.gridx = 0; bg.gridy = 1; bg.gridwidth = 3;
        bridgePanel.add(new JLabel(
                "<html><small>Run the dockerized TLSNotary API from <code>../tlsn-docker</code> with:<br>" +
                "<code>docker compose up -d notary api</code></small></html>"), bg);
        bg.gridwidth = 1;

        gc.gridx = 0; gc.gridy = 0; gc.gridwidth = 2; gc.weightx = 1.0;
        form.add(bridgePanel, gc);
        gc.gridwidth = 1;

        // Notary server section
        JPanel notaryPanel = new JPanel(new GridBagLayout());
        notaryPanel.setBorder(new TitledBorder("Optional Notary / CA Overrides"));
        GridBagConstraints ng = new GridBagConstraints();
        ng.insets = new Insets(3, 6, 3, 6);
        ng.fill = GridBagConstraints.HORIZONTAL;

        ng.gridx = 0; ng.gridy = 0; ng.weightx = 0;
        notaryPanel.add(new JLabel("Notary Host:"), ng);
        ng.gridx = 1; ng.weightx = 1.0;
        txtNotaryHost = new JTextField(20);
        notaryPanel.add(txtNotaryHost, ng);

        ng.gridx = 0; ng.gridy = 1; ng.weightx = 0;
        notaryPanel.add(new JLabel("Notary Port:"), ng);
        ng.gridx = 1; ng.weightx = 1.0;
        txtNotaryPort = new JTextField(6);
        notaryPanel.add(txtNotaryPort, ng);

        ng.gridx = 0; ng.gridy = 2; ng.weightx = 0;
        notaryPanel.add(new JLabel("CA Bundle Path:"), ng);
        ng.gridx = 1; ng.weightx = 1.0;
        txtCaCertPath = new JTextField(30);
        notaryPanel.add(txtCaCertPath, ng);
        ng.gridx = 2; ng.weightx = 0;
        JButton btnBrowseCa = new JButton("Browse…");
        btnBrowseCa.addActionListener(e -> browseFile(txtCaCertPath, "Select CA Certificate (.crt/.pem)"));
        notaryPanel.add(btnBrowseCa, ng);

        gc.gridx = 0; gc.gridy = 1; gc.gridwidth = 2; gc.weightx = 1.0;
        form.add(notaryPanel, gc);
        gc.gridwidth = 1;

        // Output & options section
        JPanel outPanel = new JPanel(new GridBagLayout());
        outPanel.setBorder(new TitledBorder("Output & Options"));
        GridBagConstraints og = new GridBagConstraints();
        og.insets = new Insets(3, 6, 3, 6);
        og.fill = GridBagConstraints.HORIZONTAL;

        og.gridx = 0; og.gridy = 0; og.weightx = 0;
        outPanel.add(new JLabel("Proof Output Directory:"), og);
        og.gridx = 1; og.weightx = 1.0;
        txtOutputDir = new JTextField(30);
        outPanel.add(txtOutputDir, og);
        og.gridx = 2; og.weightx = 0;
        JButton btnBrowseOut = new JButton("Browse…");
        btnBrowseOut.addActionListener(e -> browseDir(txtOutputDir));
        outPanel.add(btnBrowseOut, og);

        og.gridx = 0; og.gridy = 1; og.weightx = 0;
        outPanel.add(new JLabel("Proof Generation Timeout (s):"), og);
        og.gridx = 1; og.weightx = 0;
        spnTimeout = new JSpinner(new SpinnerNumberModel(120, 30, 600, 10));
        outPanel.add(spnTimeout, og);

        og.gridx = 0; og.gridy = 2; og.gridwidth = 3;
        chkHideByDefault = new JCheckBox(
                "Hide request by default (only prove response; useful for sensitive endpoints)");
        outPanel.add(chkHideByDefault, og);

        gc.gridx = 0; gc.gridy = 2; gc.gridwidth = 2; gc.weightx = 1.0;
        form.add(outPanel, gc);

        // Spacer
        gc.gridx = 0; gc.gridy = 3; gc.weighty = 1.0;
        form.add(new JPanel(), gc);

        add(new JScrollPane(form), BorderLayout.CENTER);

        // ── Save button + status bar ──────────────────────────────────────────
        JPanel bottom = new JPanel(new BorderLayout(8, 0));
        lblStatus = new JLabel(" ");
        lblStatus.setFont(lblStatus.getFont().deriveFont(Font.ITALIC));
        bottom.add(lblStatus, BorderLayout.CENTER);

        JButton btnSave = new JButton("Save Settings");
        btnSave.addActionListener(e -> saveValues());
        bottom.add(btnSave, BorderLayout.EAST);
        add(bottom, BorderLayout.SOUTH);
    }

    // ── Load / save ───────────────────────────────────────────────────────────

    private void loadValues() {
        txtApiUrl.setText(config.getApiUrl());
        txtNotaryHost.setText(config.getNotaryHost());
        txtNotaryPort.setText(String.valueOf(config.getNotaryPort()));
        txtCaCertPath.setText(config.getCaCertPath());
        txtOutputDir.setText(config.getOutputDir());
        spnTimeout.setValue(config.getTimeoutSeconds());
        chkHideByDefault.setSelected(config.isHideRequestByDefault());
    }

    private void saveValues() {
        try {
            config.setApiUrl(txtApiUrl.getText().trim());
            config.setNotaryHost(txtNotaryHost.getText().trim());
            config.setNotaryPort(Integer.parseInt(txtNotaryPort.getText().trim()));
            config.setCaCertPath(txtCaCertPath.getText().trim());
            config.setOutputDir(txtOutputDir.getText().trim());
            config.setTimeoutSeconds((Integer) spnTimeout.getValue());
            config.setHideRequestByDefault(chkHideByDefault.isSelected());
            setStatus("Settings saved.", new Color(0x2E7D32));
            logging.logToOutput("Configuration saved.");
        } catch (NumberFormatException ex) {
            setStatus("Invalid port number.", Color.RED);
        }
    }

    // ── Bridge connection test ────────────────────────────────────────────────

    private void testApiConnection() {
        setStatus("Testing connection…", Color.GRAY);
        new Thread(() -> {
            try {
                URL url = new URL(txtApiUrl.getText().trim() + "/health");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5_000);
                conn.setReadTimeout(5_000);
                int code = conn.getResponseCode();
                if (code == 200) {
                    SwingUtilities.invokeLater(() ->
                            setStatus("Connected to TLSNotary API successfully.", new Color(0x2E7D32)));
                } else {
                    SwingUtilities.invokeLater(() ->
                            setStatus("TLSNotary API responded with HTTP " + code, Color.ORANGE));
                }
            } catch (IOException ex) {
                SwingUtilities.invokeLater(() ->
                        setStatus("Cannot reach TLSNotary API: " + ex.getMessage(), Color.RED));
            }
        }, "TLSNotary-ApiTest").start();
    }

    // ── File choosers ─────────────────────────────────────────────────────────

    private void browseFile(JTextField target, String title) {
        JFileChooser fc = new JFileChooser(target.getText());
        fc.setDialogTitle(title);
        fc.setFileSelectionMode(JFileChooser.FILES_ONLY);
        if (fc.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            target.setText(fc.getSelectedFile().getAbsolutePath());
        }
    }

    private void browseDir(JTextField target) {
        JFileChooser fc = new JFileChooser(target.getText());
        fc.setDialogTitle("Select Output Directory");
        fc.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        if (fc.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
            target.setText(fc.getSelectedFile().getAbsolutePath());
        }
    }

    private void setStatus(String msg, Color color) {
        lblStatus.setText(msg);
        lblStatus.setForeground(color);
    }
}
