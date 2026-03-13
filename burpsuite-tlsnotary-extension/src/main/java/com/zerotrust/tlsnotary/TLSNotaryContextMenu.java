package com.zerotrust.tlsnotary;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.core.ToolType;
import burp.api.montoya.http.message.HttpRequestResponse;
import burp.api.montoya.logging.Logging;
import burp.api.montoya.ui.contextmenu.ContextMenuEvent;
import burp.api.montoya.ui.contextmenu.ContextMenuItemsProvider;

import javax.swing.*;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Provides right-click context menu items in BurpSuite's Repeater (and other)
 * tabs for generating TLSNotary proofs.
 */
public class TLSNotaryContextMenu implements ContextMenuItemsProvider {

    private final MontoyaApi api;
    private final TLSNotaryConfig config;
    private final Logging logging;

    public TLSNotaryContextMenu(MontoyaApi api, TLSNotaryConfig config, Logging logging) {
        this.api = api;
        this.config = config;
        this.logging = logging;
    }

    @Override
    public List<Component> provideMenuItems(ContextMenuEvent event) {
        List<Component> items = new ArrayList<>();

        // Only show in Repeater (and optionally other tool tabs)
        if (!event.isFromTool(ToolType.REPEATER) && !event.isFromTool(ToolType.PROXY)) {
            return items;
        }

        List<HttpRequestResponse> requestResponses = event.messageEditorRequestResponse()
                .map(re -> List.of(re.requestResponse()))
                .orElse(event.selectedRequestResponses());

        if (requestResponses == null || requestResponses.isEmpty()) {
            return items;
        }

        // ── Menu item: generate proof (no redaction) ─────────────────────────
        JMenuItem generateProof = new JMenuItem("Generate TLSNotary Proof");
        generateProof.setIcon(createIcon());
        generateProof.addActionListener(e ->
                launchProofGeneration(requestResponses.get(0), false, null)
        );
        items.add(generateProof);

        // ── Menu item: generate proof with selective redaction ────────────────
        JMenuItem generateProofRedacted = new JMenuItem("Generate TLSNotary Proof (with Redactions)");
        generateProofRedacted.addActionListener(e ->
                showRedactionDialog(requestResponses.get(0))
        );
        items.add(generateProofRedacted);

        // ── Separator + quick-hide shortcut ──────────────────────────────────
        items.add(new JSeparator());

        JMenuItem hideRequest = new JMenuItem("Generate TLSNotary Proof (Hide Entire Request)");
        hideRequest.setToolTipText("Generates a proof where the full request body is redacted; " +
                "only the response is revealed to the verifier.");
        hideRequest.addActionListener(e ->
                launchProofGeneration(requestResponses.get(0), true, null)
        );
        items.add(hideRequest);

        return items;
    }

    // ── Proof generation launcher ─────────────────────────────────────────────

    private void launchProofGeneration(HttpRequestResponse reqRes,
                                       boolean hideRequest,
                                       List<RedactionRule> rules) {
        ProofGenerationTask task = new ProofGenerationTask(api, config, logging, reqRes, hideRequest, rules);
        // Run on a background thread so the UI stays responsive
        new Thread(task, "TLSNotary-ProofGen").start();
    }

    // ── Redaction dialog ──────────────────────────────────────────────────────

    private void showRedactionDialog(HttpRequestResponse reqRes) {
        SwingUtilities.invokeLater(() -> {
            Window parentWindow = SwingUtilities.getWindowAncestor(
                    api.userInterface().swingUtils().suiteFrame());
            RedactionDialog dialog = new RedactionDialog(
                    parentWindow,
                    reqRes,
                    rules -> launchProofGeneration(reqRes, false, rules)
            );
            dialog.setVisible(true);
        });
    }

    // ── Tiny TLSNotary icon (16×16) ───────────────────────────────────────────

    private ImageIcon createIcon() {
        // Simple lock icon drawn programmatically so the JAR is self-contained
        Image img = new java.awt.image.BufferedImage(16, 16,
                java.awt.image.BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = ((java.awt.image.BufferedImage) img).createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        // Lock shackle
        g.setColor(new Color(0x2196F3));
        g.setStroke(new BasicStroke(1.5f));
        g.drawArc(4, 1, 8, 8, 0, 180);
        // Lock body
        g.setColor(new Color(0x1565C0));
        g.fillRoundRect(2, 8, 12, 7, 3, 3);
        // Keyhole
        g.setColor(Color.WHITE);
        g.fillOval(6, 9, 4, 4);
        g.dispose();
        return new ImageIcon(img);
    }
}
