import * as admin from "firebase-admin";

function parseServiceAccountJson(raw: string): admin.ServiceAccount {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as admin.ServiceAccount;
  } catch {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      return JSON.parse(decoded) as admin.ServiceAccount;
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON or base64. " + (e instanceof Error ? e.message : ""));
    }
  }
}

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = raw
    ? admin.credential.cert(parseServiceAccountJson(raw))
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential });
}

export const db = admin.firestore();
export const authAdmin = admin.auth();
export default admin;
