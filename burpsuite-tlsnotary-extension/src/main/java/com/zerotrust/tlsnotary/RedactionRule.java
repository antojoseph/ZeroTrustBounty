package com.zerotrust.tlsnotary;

/**
 * Represents a single redaction rule: a literal string (or header name/value)
 * that should be hidden from the TLSNotary proof sent to the verifier.
 *
 * TLSNotary's commitment scheme lets the prover selectively reveal only the
 * ranges it wants; any byte range NOT committed/revealed remains private.
 * The TLSNotary API translates these rules into private transcript ranges
 * before generating the proof.
 */
public class RedactionRule {

    public enum Type {
        /** Redact a specific HTTP header (name + value line). */
        HEADER,
        /** Redact the entire request body. */
        BODY,
        /** Redact an arbitrary literal substring anywhere in the request. */
        SUBSTRING,
        /** Redact the entire request sent-transcript (only response revealed). */
        FULL_REQUEST
    }

    private final Type type;
    private final String value; // header name for HEADER; literal for SUBSTRING; ignored otherwise

    public RedactionRule(Type type, String value) {
        this.type = type;
        this.value = value;
    }

    public Type getType() { return type; }

    /** The header name (for HEADER type) or literal string (for SUBSTRING). */
    public String getValue() { return value; }

    @Override
    public String toString() {
        return type + ":" + (value != null ? value : "");
    }
}
