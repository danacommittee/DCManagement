/**
 * SMS Gate (sms-gate.app) API client.
 * Sends SMS via POST https://api.sms-gate.app/3rdparty/v1/message
 * with Basic auth and JSON body: { message, phoneNumbers }.
 * Phone numbers are normalized to E.164 (e.g. +19162255887).
 */

import { toE164 } from "@/lib/phone";

const SMS_GATE_API_URL = "https://api.sms-gate.app/3rdparty/v1/message";

export function isSmsGateConfigured(): boolean {
  return !!(process.env.SMS_GATE_USERNAME && process.env.SMS_GATE_PASSWORD);
}

export interface SmsGateSendOptions {
  message: string;
  phoneNumbers: string[];
}

export interface SmsGateSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Send one SMS to one or more phone numbers (same message).
 * Numbers are normalized to E.164; invalid entries are skipped.
 */
export async function sendSmsGate(options: SmsGateSendOptions): Promise<SmsGateSendResult> {
  const username = process.env.SMS_GATE_USERNAME;
  const password = process.env.SMS_GATE_PASSWORD;
  if (!username || !password) {
    return { ok: false, error: "SMS Gate credentials not configured" };
  }

  const normalized = options.phoneNumbers.map((p) => toE164(p)).filter((n): n is string => n != null);
  if (normalized.length === 0) {
    return { ok: false, error: "No valid phone numbers after normalization" };
  }

  const body = JSON.stringify({
    message: options.message,
    phoneNumbers: normalized,
  });

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  try {
    const res = await fetch(SMS_GATE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `SMS Gate API ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}
