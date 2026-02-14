/**
 * Normalize phone to E.164 for SMS gateway / Twilio.
 * Handles: 1 (346) 715-8199, (832) 309-5252, 832-309-5252, +1 832 309 5252, etc.
 * Returns null if there aren't enough digits to form a valid number.
 */
function normalizeDigits(input: string): string {
  return input.replace(/\s/g, "").replace(/\D/g, "");
}

export function toE164(phone: string | null | undefined): string | null {
  if (phone == null || typeof phone !== "string") return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = normalizeDigits(trimmed);
  if (digits.length < 10) return null;
  // US/Canada: 10 digits -> +1xxxxxxxxxx; 11 digits starting with 1 -> +1xxxxxxxxxx
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  // Longer (e.g. with country code): use as-is with +
  return "+" + digits;
}
