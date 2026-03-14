const DEFAULT_TLSN_API_URL = "http://127.0.0.1:8080";

export interface VerifiedTlsPresentation {
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

export function getTlsnApiUrl() {
  return process.env.TLSN_API_URL || DEFAULT_TLSN_API_URL;
}

export async function verifyTlsPresentationWithApi(
  proof: Buffer,
  originalFileName: string
): Promise<VerifiedTlsPresentation> {
  const response = await fetch(`${getTlsnApiUrl()}/verify`, {
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
      error instanceof Error ? error.message : "Failed to reach the TLSNotary API",
      500
    );
  });

  const payload = (await response
    .json()
    .catch(() => null)) as VerifyTlsPresentationApiResponse | VerifyTlsPresentationApiError | null;

  if (!response.ok) {
    const details =
      payload && "details" in payload && typeof payload.details === "string"
        ? payload.details
        : "TLSNotary API verification failed";
    throw new TlsProofVerificationError(
      details,
      response.status >= 400 && response.status < 500 ? 400 : 500
    );
  }

  if (
    !payload ||
    !("server_name" in payload) ||
    typeof payload.server_name !== "string" ||
    typeof payload.session_time !== "string" ||
    typeof payload.sent_data !== "string" ||
    typeof payload.recv_data !== "string" ||
    typeof payload.sent_len !== "number" ||
    typeof payload.recv_len !== "number"
  ) {
    throw new TlsProofVerificationError(
      "TLSNotary API returned an invalid verification payload",
      500
    );
  }

  return {
    serverName: payload.server_name,
    sessionTime: payload.session_time,
    sentData: payload.sent_data,
    recvData: payload.recv_data,
    sentLen: payload.sent_len,
    recvLen: payload.recv_len,
  };
}
