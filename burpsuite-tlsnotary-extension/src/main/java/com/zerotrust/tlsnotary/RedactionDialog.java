package com.zerotrust.tlsnotary;

import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.http.message.requests.HttpRequest;

import javax.swing.*;
import javax.swing.border.TitledBorder;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Modal dialog that lets the user choose which parts of the request to redact
 * before generating the TLSNotary proof.
 *
 * Redaction options:
 *  • Individual headers (shown as checkboxes)
 *  • Entire request body
 *  • Custom literal substrings (e.g. session tokens)
 *  • Full request (only response will be proven)
 */
public class RedactionDialog extends JDialog {

    private final HttpRequestResponse reqRes;
    private final Consumer<List<RedactionRule>> onGenerate;

    // Controls
    private JCheckBox chkHideFullRequest;
    private JPanel headersPanel;
    private final List<JCheckBox> headerCheckBoxes = new ArrayList<>();
    private JCheckBox chkHideBody;
    private JTextArea txtCustomSubstrings;

    public RedactionDialog(Window parent,
                           HttpRequestResponse reqRes,
                           Consumer<List<RedactionRule>> onGenerate) {
        super(parent, "TLSNotary Proof – Redaction Options", ModalityType.APPLICATION_MODAL);
        this.reqRes = reqRes;
        this.onGenerate = onGenerate;
        buildUI();
        pack();
        setMinimumSize(new Dimension(520, 460));
        setLocationRelativeTo(parent);
    }

    private void buildUI() {
        setLayout(new BorderLayout(8, 8));
        ((JComponent) getContentPane()).setBorder(BorderFactory.createEmptyBorder(12, 12, 12, 12));

        // ── Description ──────────────────────────────────────────────────────
        JLabel desc = new JLabel(
                "<html><b>Select which request parts to hide from the TLSNotary proof.</b><br>" +
                "Hidden data is committed but <i>not revealed</i> to verifiers – " +
                "the proof still covers the full TLS session.</html>");
        add(desc, BorderLayout.NORTH);

        // ── Center: redaction options ─────────────────────────────────────────
        JPanel center = new JPanel();
        center.setLayout(new BoxLayout(center, BoxLayout.Y_AXIS));

        // Full-request hide
        chkHideFullRequest = new JCheckBox("Hide entire request (only response is revealed)");
        chkHideFullRequest.addActionListener(e -> toggleDetailedOptions(!chkHideFullRequest.isSelected()));
        center.add(wrap(chkHideFullRequest));
        center.add(Box.createVerticalStrut(8));

        // Headers panel
        headersPanel = new JPanel(new GridLayout(0, 2, 4, 2));
        headersPanel.setBorder(new TitledBorder("Request Headers to Redact"));
        populateHeaders();
        JScrollPane headersScroll = new JScrollPane(headersPanel);
        headersScroll.setPreferredSize(new Dimension(480, 150));
        center.add(headersScroll);
        center.add(Box.createVerticalStrut(8));

        // Body
        chkHideBody = new JCheckBox("Hide request body");
        center.add(wrap(chkHideBody));
        center.add(Box.createVerticalStrut(8));

        // Custom substrings
        JPanel customPanel = new JPanel(new BorderLayout(4, 4));
        customPanel.setBorder(new TitledBorder(
                "Custom Substrings to Redact (one per line, e.g. Authorization header values)"));
        txtCustomSubstrings = new JTextArea(4, 40);
        txtCustomSubstrings.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 11));
        customPanel.add(new JScrollPane(txtCustomSubstrings), BorderLayout.CENTER);
        center.add(customPanel);

        add(new JScrollPane(center), BorderLayout.CENTER);

        // ── Buttons ───────────────────────────────────────────────────────────
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));

        JButton btnCancel = new JButton("Cancel");
        btnCancel.addActionListener(e -> dispose());

        JButton btnGenerate = new JButton("Generate Proof");
        btnGenerate.setBackground(new Color(0x1565C0));
        btnGenerate.setForeground(Color.WHITE);
        btnGenerate.setOpaque(true);
        btnGenerate.addActionListener(e -> generate());

        buttons.add(btnCancel);
        buttons.add(btnGenerate);
        add(buttons, BorderLayout.SOUTH);
    }

    private void populateHeaders() {
        HttpRequest req = reqRes.request();
        req.headers().forEach(header -> {
            JCheckBox cb = new JCheckBox(header.name() + ": " + truncate(header.value(), 30));
            cb.setName(header.name()); // store header name for rule creation
            cb.setToolTipText(header.name() + ": " + header.value());
            headerCheckBoxes.add(cb);
            headersPanel.add(cb);
        });
    }

    private void toggleDetailedOptions(boolean enabled) {
        headersPanel.setEnabled(enabled);
        headerCheckBoxes.forEach(cb -> cb.setEnabled(enabled));
        chkHideBody.setEnabled(enabled);
        txtCustomSubstrings.setEnabled(enabled);
    }

    private void generate() {
        List<RedactionRule> rules = new ArrayList<>();

        if (chkHideFullRequest.isSelected()) {
            rules.add(new RedactionRule(RedactionRule.Type.FULL_REQUEST, null));
        } else {
            for (JCheckBox cb : headerCheckBoxes) {
                if (cb.isSelected()) {
                    rules.add(new RedactionRule(RedactionRule.Type.HEADER, cb.getName()));
                }
            }
            if (chkHideBody.isSelected()) {
                rules.add(new RedactionRule(RedactionRule.Type.BODY, null));
            }
            String customText = txtCustomSubstrings.getText().trim();
            if (!customText.isEmpty()) {
                for (String line : customText.split("\\n")) {
                    String s = line.trim();
                    if (!s.isEmpty()) {
                        rules.add(new RedactionRule(RedactionRule.Type.SUBSTRING, s));
                    }
                }
            }
        }

        dispose();
        onGenerate.accept(rules);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static JPanel wrap(JComponent c) {
        JPanel p = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        p.add(c);
        return p;
    }

    private static String truncate(String s, int max) {
        return (s.length() <= max) ? s : s.substring(0, max) + "…";
    }
}
