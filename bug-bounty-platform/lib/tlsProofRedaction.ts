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
  if (!input.redactedRequest) {
    return {
      ok: false as const,
      error: "No verified TLSNotary request is attached to this report.",
    };
  }

  const normalizedRedactedRequest = normalizeTlsProofText(input.redactedRequest);
  const hiddenRanges = getHiddenComponentRanges(normalizedRedactedRequest);

  if (hiddenRanges.length === 0) {
    return {
      ok: false as const,
      error:
        "This TLSNotary proof does not contain hidden request components.",
    };
  }

  const normalizedFullRequest = normalizeTlsProofText(input.fullRequest ?? "");
  if (!normalizedFullRequest || normalizedFullRequest.trim().length === 0) {
    return {
      ok: false as const,
      error:
        "The uploaded full presentation does not expose the full request.",
    };
  }

  if (hasHiddenComponents(normalizedFullRequest)) {
    return {
      ok: false as const,
      error:
        "The uploaded full presentation still hides request components.",
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

  return {
    ok: true as const,
    normalizedFullRequest,
    hiddenRanges,
  };
}
