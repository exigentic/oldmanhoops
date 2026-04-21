export class InvalidPhoneError extends Error {
  constructor(message = "Phone must be 10–15 digits") {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

const STRIP_CHARS = /[\s().\-]/g;
const VALID = /^\+?\d{10,15}$/;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const stripped = trimmed.replace(STRIP_CHARS, "");
  if (!VALID.test(stripped)) {
    throw new InvalidPhoneError();
  }
  return stripped;
}
