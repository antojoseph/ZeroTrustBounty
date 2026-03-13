package com.zerotrust.tlsnotary;

import burp.api.montoya.BurpExtension;
import burp.api.montoya.MontoyaApi;
import burp.api.montoya.logging.Logging;

/**
 * TLSNotary BurpSuite Extension
 *
 * Integrates TLSNotary proof generation directly into BurpSuite's Repeater tab.
 * Right-click any request in Repeater to generate a cryptographic TLSNotary proof
 * of the request/response, optionally redacting sensitive fields.
 */
public class TLSNotaryExtension implements BurpExtension {

    public static final String EXTENSION_NAME = "TLSNotary Proof Generator";
    public static final String VERSION = "1.0.0";

    private MontoyaApi api;
    private TLSNotaryConfig config;
    private Logging logging;

    @Override
    public void initialize(MontoyaApi api) {
        this.api = api;
        this.logging = api.logging();

        api.extension().setName(EXTENSION_NAME);

        logging.logToOutput("==============================================");
        logging.logToOutput(EXTENSION_NAME + " v" + VERSION + " loading...");
        logging.logToOutput("==============================================");

        // Load persisted configuration
        this.config = new TLSNotaryConfig(api);

        // Register the UI settings tab
        TLSNotaryPanel settingsPanel = new TLSNotaryPanel(api, config, logging);
        api.userInterface().registerSuiteTab("TLSNotary", settingsPanel);

        // Register the Repeater right-click context menu
        TLSNotaryContextMenu contextMenu = new TLSNotaryContextMenu(api, config, logging);
        api.userInterface().registerContextMenuItemsProvider(contextMenu);

        logging.logToOutput("Extension loaded successfully.");
        logging.logToOutput("Configure the bridge service URL in the TLSNotary tab.");
        logging.logToOutput("Right-click any request in Repeater to generate a proof.");
    }
}
