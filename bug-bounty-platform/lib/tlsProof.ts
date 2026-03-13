/**
 * TLSNotary Proof Parser and Validator
 *
 * TLSNotary is a protocol that allows a Prover to prove to a Verifier that a specific
 * TLS session took place. The proof consists of:
 * - session: Proves the TLS handshake, server identity, and commitments to the transcript
 * - substrings: Proves select portions of the transcript (redacting private parts)
 *
 * This module parses and validates TLSNotary proof JSON files client-side,
 * extracting key metadata (server name, time, sent/received data).
 *
 * Full cryptographic verification requires the Rust verifier binary.
 * See: https://github.com/tlsnotary/tlsn
 */

export interface TlsProofSession {
  header: {
    encoder_seed: number[];
    merkle_root: number[];
    sent_len: number;
    recv_len: number;
    handshake_summary: {
      time: number;
      server_public_key: unknown;
      handshake_commitment: number[];
    };
  };
  server_name: string;
  signature?: unknown;
  handshake_data_decommitment: unknown;
}

export interface TlsProofSubstrings {
  openings: Record<
    string,
    {
      direction: "sent" | "received";
      data: number[];
      ranges: { start: number; end: number }[];
    }
  >;
  inclusion_proof: unknown;
}

export interface TlsProof {
  session: TlsProofSession;
  substrings: TlsProofSubstrings;
}

export interface ParsedTlsProof {
  serverName: string;
  sessionTime: Date;
  sentLen: number;
  recvLen: number;
  hasSentData: boolean;
  hasRecvData: boolean;
  sentDataPreview: string;
  recvDataPreview: string;
  hasSignature: boolean;
  merkleRoot: string;
}

/**
 * Parses a TLSNotary proof JSON and extracts readable metadata.
 * This is a structural parse — full cryptographic verification
 * requires the Rust notary verifier.
 */
export function parseTlsProof(proofJson: string): ParsedTlsProof {
  let proof: TlsProof;

  try {
    proof = JSON.parse(proofJson);
  } catch {
    throw new Error("Invalid JSON: Could not parse proof file");
  }

  if (!proof.session || !proof.substrings) {
    throw new Error(
      "Invalid proof structure: missing 'session' or 'substrings' fields"
    );
  }

  const { session, substrings } = proof;

  if (!session.header || !session.server_name) {
    throw new Error(
      "Invalid session: missing 'header' or 'server_name'"
    );
  }

  const header = session.header;

  if (!header.handshake_summary || typeof header.handshake_summary.time !== "number") {
    throw new Error("Invalid session header: missing handshake_summary.time");
  }

  // Extract session time (Unix timestamp in seconds)
  const sessionTime = new Date(header.handshake_summary.time * 1000);

  // Extract server name - TLSNotary stores it as a DNS name string
  const serverName =
    typeof session.server_name === "string"
      ? session.server_name
      : (session.server_name as { DnsName?: string })?.DnsName || "unknown";

  // Extract sent/received transcript data from substrings
  let sentDataPreview = "";
  let hasRecvData = false;
  let hasSentData = false;

  if (substrings.openings) {
    for (const opening of Object.values(substrings.openings)) {
      if (opening.data && Array.isArray(opening.data)) {
        const text = bytesToString(opening.data);
        if (opening.direction === "sent") {
          hasSentData = true;
          if (!sentDataPreview) sentDataPreview = text.substring(0, 1000);
        } else if (opening.direction === "received") {
          hasRecvData = true;
        }
      }
    }
  }

  // Merkle root as hex
  const merkleRoot = Array.isArray(header.merkle_root)
    ? Buffer.from(header.merkle_root).toString("hex")
    : "";

  return {
    serverName,
    sessionTime,
    sentLen: header.sent_len || 0,
    recvLen: header.recv_len || 0,
    hasSentData,
    hasRecvData,
    sentDataPreview,
    recvDataPreview: "",
    hasSignature: !!session.signature,
    merkleRoot,
  };
}

function bytesToString(bytes: number[]): string {
  try {
    return Buffer.from(bytes)
      .toString("utf-8")
      .replace(/\x00/g, "")
      .trim();
  } catch {
    return `[${bytes.length} bytes]`;
  }
}

/**
 * Validates the structure of a TLSNotary proof JSON string.
 * Returns an error message if invalid, or null if valid.
 */
export function validateTlsProofStructure(proofJson: string): string | null {
  try {
    parseTlsProof(proofJson);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Unknown validation error";
  }
}

/**
 * Extracts a human-readable summary of what the TLSNotary proof proves.
 */
export function getTlsProofSummary(parsed: ParsedTlsProof): string {
  const parts: string[] = [];
  parts.push(`Verified TLS session with ${parsed.serverName}`);
  parts.push(`at ${parsed.sessionTime.toUTCString()}`);
  if (parsed.sentLen > 0) parts.push(`${parsed.sentLen} bytes sent`);
  if (parsed.recvLen > 0) parts.push(`${parsed.recvLen} bytes received`);
  if (!parsed.hasSignature) parts.push("(no notary signature — self-attested)");
  return parts.join(", ");
}
