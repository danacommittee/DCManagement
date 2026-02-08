import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, type User } from "firebase/auth";

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

function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") return authStub;
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return authStub;
  const app = !getApps().length ? initializeApp(firebaseConfig) : (getApp() as FirebaseApp);
  return getAuth(app);
}

export const auth = getFirebaseAuth();
export const isFirebaseConfigured =
  typeof window !== "undefined" && !!firebaseConfig.apiKey && !!firebaseConfig.projectId;
export default auth;
