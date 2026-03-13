package com.zerotrust.tlsnotary;

import burp.api.montoya.MontoyaApi;
import burp.api.montoya.persistence.Preferences;

/**
 * Persisted configuration for the TLSNotary extension.
 * Settings are stored in BurpSuite's project/extension preferences so they
 * survive restarts.
 */
public class TLSNotaryConfig {

    // Preference keys
    private static final String KEY_BRIDGE_URL      = "tlsnotary.bridge_url";
    private static final String KEY_NOTARY_HOST     = "tlsnotary.notary_host";
    private static final String KEY_NOTARY_PORT     = "tlsnotary.notary_port";
    private static final String KEY_CA_CERT_PATH    = "tlsnotary.ca_cert_path";
    private static final String KEY_OUTPUT_DIR      = "tlsnotary.output_dir";
    private static final String KEY_HIDE_REQUEST    = "tlsnotary.hide_request";
    private static final String KEY_TIMEOUT_SECONDS = "tlsnotary.timeout_seconds";

    // Defaults
    public static final String  DEFAULT_BRIDGE_URL      = "http://127.0.0.1:7777";
    public static final String  DEFAULT_NOTARY_HOST     = "127.0.0.1";
    public static final int     DEFAULT_NOTARY_PORT     = 7047;
    public static final String  DEFAULT_CA_CERT_PATH    = "./rootCA.crt";
    public static final String  DEFAULT_OUTPUT_DIR      = System.getProperty("user.home") + "/tlsnotary-proofs";
    public static final boolean DEFAULT_HIDE_REQUEST    = false;
    public static final int     DEFAULT_TIMEOUT_SECONDS = 120;

    private final Preferences prefs;

    public TLSNotaryConfig(MontoyaApi api) {
        this.prefs = api.persistence().extensionData();
    }

    // ── Bridge service (the Python helper that drives the Rust prover) ──────

    public String getBridgeUrl() {
        String v = prefs.getString(KEY_BRIDGE_URL);
        return (v != null && !v.isEmpty()) ? v : DEFAULT_BRIDGE_URL;
    }

    public void setBridgeUrl(String url) {
        prefs.setString(KEY_BRIDGE_URL, url);
    }

    // ── TLSNotary notary server ──────────────────────────────────────────────

    public String getNotaryHost() {
        String v = prefs.getString(KEY_NOTARY_HOST);
        return (v != null && !v.isEmpty()) ? v : DEFAULT_NOTARY_HOST;
    }

    public void setNotaryHost(String host) {
        prefs.setString(KEY_NOTARY_HOST, host);
    }

    public int getNotaryPort() {
        Integer v = prefs.getInteger(KEY_NOTARY_PORT);
        return (v != null) ? v : DEFAULT_NOTARY_PORT;
    }

    public void setNotaryPort(int port) {
        prefs.setInteger(KEY_NOTARY_PORT, port);
    }

    public String getCaCertPath() {
        String v = prefs.getString(KEY_CA_CERT_PATH);
        return (v != null && !v.isEmpty()) ? v : DEFAULT_CA_CERT_PATH;
    }

    public void setCaCertPath(String path) {
        prefs.setString(KEY_CA_CERT_PATH, path);
    }

    // ── Proof output ─────────────────────────────────────────────────────────

    public String getOutputDir() {
        String v = prefs.getString(KEY_OUTPUT_DIR);
        return (v != null && !v.isEmpty()) ? v : DEFAULT_OUTPUT_DIR;
    }

    public void setOutputDir(String dir) {
        prefs.setString(KEY_OUTPUT_DIR, dir);
    }

    // ── Optional: hide / redact request by default ───────────────────────────

    public boolean isHideRequestByDefault() {
        Boolean v = prefs.getBoolean(KEY_HIDE_REQUEST);
        return (v != null) ? v : DEFAULT_HIDE_REQUEST;
    }

    public void setHideRequestByDefault(boolean hide) {
        prefs.setBoolean(KEY_HIDE_REQUEST, hide);
    }

    // ── Proof-generation timeout ─────────────────────────────────────────────

    public int getTimeoutSeconds() {
        Integer v = prefs.getInteger(KEY_TIMEOUT_SECONDS);
        return (v != null) ? v : DEFAULT_TIMEOUT_SECONDS;
    }

    public void setTimeoutSeconds(int seconds) {
        prefs.setInteger(KEY_TIMEOUT_SECONDS, seconds);
    }
}
