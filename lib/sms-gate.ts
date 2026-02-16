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
  
  // Better error message for missing credentials
  if (!username || !password) {
    const missing = [];
    if (!username) missing.push("SMS_GATE_USERNAME");
    if (!password) missing.push("SMS_GATE_PASSWORD");
    const errorMsg = `SMS Gate credentials not configured. Missing: ${missing.join(", ")}. Please check your environment variables.`;
    console.error("[SMS Gate]", errorMsg);
    return { ok: false, error: errorMsg };
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
      const errorMsg = `SMS Gate API error (${res.status}): ${text || "Unknown error"}`;
      console.error("[SMS Gate]", errorMsg, { status: res.status, statusText: res.statusText });
      return { ok: false, error: errorMsg };
    }
    
    const responseText = await res.text();
    console.log("[SMS Gate] Success:", { phoneCount: normalized.length, response: responseText || "OK" });
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const errorMsg = `SMS Gate network error: ${err}`;
    console.error("[SMS Gate]", errorMsg, e);
    return { ok: false, error: errorMsg };
  }
}
