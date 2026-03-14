const TLSN_CLIPBOARD_PREFIX = "tlsn-presentation-v1:";

interface PastedTlsnPayload {
  fileName: string;
  mimeType?: string;
  base64: string;
}

export const MAX_PROOF_SIZE_BYTES = 1024 * 1024;

export function isEditableElement(element: Element | null) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function fileFromClipboardPayload(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith(TLSN_CLIPBOARD_PREFIX)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      trimmed.slice(TLSN_CLIPBOARD_PREFIX.length)
    ) as PastedTlsnPayload;

    if (
      !payload ||
      typeof payload.fileName !== "string" ||
      !payload.fileName.endsWith(".tlsn") ||
      typeof payload.base64 !== "string" ||
      payload.base64.length === 0
    ) {
      return null;
    }

    return new File([decodeBase64(payload.base64)], payload.fileName, {
      type: payload.mimeType || "application/octet-stream",
    });
  } catch {
    return null;
  }
}

export function fileFromClipboardData(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return null;
  }

  const directFile = Array.from(clipboardData.files).find((file) =>
    file.name.endsWith(".tlsn")
  );
  if (directFile) {
    return directFile;
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile();
    if (file?.name.endsWith(".tlsn")) {
      return file;
    }
  }

  return fileFromClipboardPayload(clipboardData.getData("text/plain"));
}
