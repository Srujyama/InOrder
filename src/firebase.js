// Firebase initialization. Config comes from Vite env vars (VITE_FIREBASE_*),
// set in .env.local for dev and in Vercel project settings for production.
// These values are public client identifiers — security is enforced by Firestore
// rules, not by hiding them.
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// True only when all required config is present.
export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
)

let app, auth, db
if (firebaseReady) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}

export { app, auth, db }
export const googleProvider = firebaseReady ? new GoogleAuthProvider() : null
