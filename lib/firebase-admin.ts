import * as admin from "firebase-admin";

if (!admin.apps.length) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = json
    ? admin.credential.cert(JSON.parse(json) as admin.ServiceAccount)
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential });
}

export const db = admin.firestore();
export const authAdmin = admin.auth();
export default admin;
