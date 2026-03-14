export interface HiddenComponentRange {
  start: number;
  end: number;
}

const MIN_HIDDEN_COMPONENT_RUN = 6;

export function normalizeTlsProofText(value: string) {
  return value.replace(/\r\n/g, "\n");
}

export function getHiddenComponentRanges(
  value: string | null | undefined
): HiddenComponentRange[] {
  if (!value) {
    return [];
  }

  const normalized = normalizeTlsProofText(value);
  const ranges: HiddenComponentRange[] = [];
  const pattern = new RegExp(`X{${MIN_HIDDEN_COMPONENT_RUN},}`, "g");

  for (const match of normalized.matchAll(pattern)) {
    if (match.index === undefined) {
      continue;
    }

    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return ranges;
}

export function hasHiddenComponents(value: string | null | undefined) {
  return getHiddenComponentRanges(value).length > 0;
}

export function validateFullRequestReveal(
  redactedRequest: string | null | undefined,
  fullRequest: string | null | undefined
) {
  if (!redactedRequest) {
    return {
      ok: false as const,
      error: "No verified TLSNotary request is attached to this report.",
    };
  }

  if (!fullRequest || fullRequest.trim().length === 0) {
    return {
      ok: false as const,
      error: "Paste the full HTTP request you want to reveal.",
    };
  }

  const normalizedRedacted = normalizeTlsProofText(redactedRequest);
  const normalizedFull = normalizeTlsProofText(fullRequest);
  const hiddenRanges = getHiddenComponentRanges(normalizedRedacted);

  if (hiddenRanges.length === 0) {
    return {
      ok: false as const,
      error: "This TLSNotary proof does not contain hidden request components.",
    };
  }

  if (normalizedRedacted.length !== normalizedFull.length) {
    return {
      ok: false as const,
      error:
        "The revealed request must match the exact length of the redacted request stored in the TLSNotary proof.",
    };
  }

  let revealedHiddenByte = false;
  for (let index = 0; index < normalizedRedacted.length; index += 1) {
    const insideHiddenRange = hiddenRanges.some(
      (range) => index >= range.start && index < range.end
    );

    if (insideHiddenRange) {
      if (normalizedFull[index] !== "X") {
        revealedHiddenByte = true;
      }
      continue;
    }

    if (normalizedRedacted[index] !== normalizedFull[index]) {
      return {
        ok: false as const,
        error:
          "The revealed request does not match the verified TLSNotary request outside the hidden sections.",
      };
    }
  }

  if (!revealedHiddenByte) {
    return {
      ok: false as const,
      error:
        "The submitted request still appears redacted. Reveal at least one of the hidden sections before submitting.",
    };
  }

  return {
    ok: true as const,
    normalizedFullRequest: normalizedFull,
    hiddenRanges,
  };
}

interface ValidateFullPresentationRevealInput {
  redactedRequest: string | null | undefined;
  fullRequest: string | null | undefined;
  redactedResponse: string | null | undefined;
  fullResponse: string | null | undefined;
  redactedServerName: string | null | undefined;
  fullServerName: string | null | undefined;
  redactedSessionTime: Date | string | null | undefined;
  fullSessionTime: Date | string | null | undefined;
  redactedAttestationFingerprint: string | null | undefined;
  fullAttestationFingerprint: string | null | undefined;
}

function normalizeServerName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function parseSessionTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateFullPresentationReveal(
  input: ValidateFullPresentationRevealInput
) {
  const requestValidation = validateFullRequestReveal(
    input.redactedRequest,
    input.fullRequest
  );

  if (!requestValidation.ok) {
    return requestValidation;
  }

  const normalizedRedactedResponse = normalizeTlsProofText(
    input.redactedResponse ?? ""
  );
  const normalizedFullResponse = normalizeTlsProofText(input.fullResponse ?? "");

  if (!normalizedRedactedResponse) {
    return {
      ok: false as const,
      error: "No verified TLSNotary response is attached to this report.",
    };
  }

  if (normalizedRedactedResponse !== normalizedFullResponse) {
    return {
      ok: false as const,
      error:
        "The uploaded full presentation does not expose the same verified HTTP response as the original redacted proof.",
    };
  }

  const redactedServerName = normalizeServerName(input.redactedServerName);
  const fullServerName = normalizeServerName(input.fullServerName);
  if (!redactedServerName || !fullServerName || redactedServerName !== fullServerName) {
    return {
      ok: false as const,
      error:
        "The uploaded full presentation targets a different verified server than the original redacted proof.",
    };
  }

  if (
    !input.redactedAttestationFingerprint ||
    !input.fullAttestationFingerprint ||
    input.redactedAttestationFingerprint !== input.fullAttestationFingerprint
  ) {
    return {
      ok: false as const,
      error:
        "The uploaded full presentation was not generated from the same notarized TLS session as the original redacted proof.",
    };
  }

  const redactedSessionTime = parseSessionTimestamp(input.redactedSessionTime);
  const fullSessionTime = parseSessionTimestamp(input.fullSessionTime);
  if (
    redactedSessionTime === null ||
    fullSessionTime === null ||
    redactedSessionTime !== fullSessionTime
  ) {
    return {
      ok: false as const,
      error:
        "The uploaded full presentation has a different verified TLS session time than the original redacted proof.",
    };
  }

  return requestValidation;
}
