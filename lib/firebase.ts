import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, type Auth, type User } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** Stub used during SSR/build when env vars are missing so Firebase is not initialized with invalid key */
const authStub: Auth = {
  currentUser: null,
  onAuthStateChanged(_auth: Auth, cb: (u: User | null) => void) {
    cb(null);
    return () => {};
  },
} as unknown as Auth;

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return null;
  return !getApps().length ? initializeApp(firebaseConfig) : (getApp() as FirebaseApp);
}

function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") return authStub;
  const app = getFirebaseApp();
  if (!app) return authStub;
  return getAuth(app);
}

/** Client Firestore instance with IndexedDB persistence. */
let firestoreClient: Firestore | null = null;

export function getFirestoreClient(): Firestore | null {
  if (firestoreClient) return firestoreClient;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    firestoreClient = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return null;
  }
  return firestoreClient;
}

export const auth = getFirebaseAuth();
export const isFirebaseConfigured =
  typeof window !== "undefined" && !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

/** Set auth to persist in local storage until sign out or 30-day expiry (handled in AuthContext). */
export async function setAuthPersistence(): Promise<void> {
  if (typeof window === "undefined" || !isFirebaseConfigured) return;
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("[Firebase] setPersistence failed:", e);
  }
}

export default auth;
