const DEFAULT_TLSN_API_URLS = [
  "http://127.0.0.1:8090",
] as const;

export interface VerifiedTlsPresentation {
  attestationFingerprint: string;
  serverName: string;
  sessionTime: string;
  sentData: string;
  recvData: string;
  sentLen: number;
  recvLen: number;
}

interface VerifyTlsPresentationApiResponse {
  status: string;
  file_name?: string | null;
  attestation_fingerprint: string;
  server_name: string;
  session_time: string;
  sent_data: string;
  recv_data: string;
  sent_len: number;
  recv_len: number;
}

interface VerifyTlsPresentationApiError {
  error?: string;
  details?: string;
}

export class TlsProofVerificationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "TlsProofVerificationError";
    this.statusCode = statusCode;
  }
}

export function getTlsnApiUrls() {
  const configuredUrls = (process.env.TLSN_API_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (configuredUrls.length > 0) {
    return Array.from(new Set(configuredUrls));
  }

  return [...DEFAULT_TLSN_API_URLS];
}

export async function verifyTlsPresentationWithApi(
  proof: Buffer,
  originalFileName: string
): Promise<VerifiedTlsPresentation> {
  const candidateUrls = getTlsnApiUrls();
  const failures: string[] = [];

  for (const apiUrl of candidateUrls) {
    try {
      return await verifyTlsPresentationAtUrl(apiUrl, proof, originalFileName);
    } catch (error) {
      if (
        error instanceof TlsProofVerificationError &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      ) {
        throw error;
      }

      failures.push(
        `${apiUrl}: ${error instanceof Error ? error.message : "Unknown API error"}`
      );
    }
  }

  throw new TlsProofVerificationError(
    `Failed to reach a working TLSNotary API. Tried ${candidateUrls.join(", ")}. ${failures.join(
      " | "
    )}`,
    500
  );
}

async function verifyTlsPresentationAtUrl(
  apiUrl: string,
  proof: Buffer,
  originalFileName: string
) {
  const response = await fetch(`${apiUrl}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: originalFileName,
      presentation_b64: proof.toString("base64"),
    }),
    cache: "no-store",
  }).catch((error: unknown) => {
    throw new TlsProofVerificationError(
      `Failed to reach the TLSNotary API at ${apiUrl}: ${
        error instanceof Error ? error.message : "unknown fetch error"
      }`,
      500
    );
  });

  const payload = (await response.json().catch(() => null)) as
    | VerifyTlsPresentationApiResponse
    | VerifyTlsPresentationApiError
    | null;

  if (!response.ok) {
    const details =
      payload && "details" in payload && typeof payload.details === "string"
        ? payload.details
        : `TLSNotary API at ${apiUrl} returned HTTP ${response.status}`;

    throw new TlsProofVerificationError(
      details,
      response.status >= 400 && response.status < 500 ? 400 : 500
    );
  }

  if (
    !payload ||
    !("attestation_fingerprint" in payload) ||
    typeof payload.attestation_fingerprint !== "string" ||
    !("server_name" in payload) ||
    typeof payload.server_name !== "string" ||
    typeof payload.session_time !== "string" ||
    typeof payload.sent_data !== "string" ||
    typeof payload.recv_data !== "string" ||
    typeof payload.sent_len !== "number" ||
    typeof payload.recv_len !== "number"
  ) {
    throw new TlsProofVerificationError(
      `TLSNotary API at ${apiUrl} returned an invalid verification payload`,
      500
    );
  }

  return {
    attestationFingerprint: payload.attestation_fingerprint,
    serverName: payload.server_name,
    sessionTime: payload.session_time,
    sentData: payload.sent_data,
    recvData: payload.recv_data,
    sentLen: payload.sent_len,
    recvLen: payload.recv_len,
  };
}
