import { useEffect, useState } from 'react'
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth, googleProvider, firebaseReady } from './firebase.js'

// Auth state hook. Returns { user, loading }.
// When Firebase isn't configured, returns a synthetic local user so dev works offline.
export function useAuth() {
  const [user, setUser] = useState(firebaseReady ? undefined : { uid: 'local', displayName: 'Local', email: '', local: true })
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) return
    // Complete a redirect sign-in if we just came back from one (the popup-blocked fallback).
    getRedirectResult(auth).catch(() => {})
    return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false) })
  }, [])

  return { user, loading }
}

export function doSignOut() {
  if (firebaseReady) return signOut(auth)
}

export function SignIn() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const google = () => {
    // Popup sign-in. Open it SYNCHRONOUSLY inside the click — no setState/await before it
    // — or the browser blocks it as non-user-initiated. The COOP header
    // (Cross-Origin-Opener-Policy: same-origin-allow-popups, set in vercel.json) is what
    // lets Firebase talk to the popup window in modern Chrome. authDomain stays on
    // <project>.firebaseapp.com so Google's OAuth client trusts the redirect URI.
    setError('')
    signInWithPopup(auth, googleProvider)
      .then(() => setBusy(true)) // success → auth state change unmounts this screen
      .catch((e) => {
        const code = (e && e.code) || ''
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
        // If the browser blocked the popup (a saved per-site setting can't be overridden by
        // the COOP header), fall back to a full-page redirect. authDomain is on
        // firebaseapp.com so this uses Google's authorized redirect URI (no mismatch).
        if (code === 'auth/popup-blocked' || /popup/i.test(code)) {
          signInWithRedirect(auth, googleProvider).catch((re) => setError(prettyError(re)))
          return
        }
        setError(prettyError(e))
      })
  }

  const emailAuth = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      if (mode === 'signup') await createUserWithEmailAndPassword(auth, email, password)
      else await signInWithEmailAndPassword(auth, email, password)
    } catch (err) { setError(prettyError(err)) }
    finally { setBusy(false) }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="auth-screen">
      <ShowcasePanel />

      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand auth-brand-mobile">
            <span className="auth-mark" aria-hidden>
              <span className="auth-mark-dot" />
            </span>
            <div className="auth-brand-text">
              <h1>life</h1>
              <span className="auth-brand-sub">study tracker</span>
            </div>
          </div>

          <div className="auth-head">
            <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p>{isSignup ? 'Start tracking what you’re learning.' : 'Sign in to pick up where you left off.'}</p>
          </div>

          <button className="auth-google" onClick={google} disabled={busy}>
            <GoogleG /> Continue with Google
          </button>

          <div className="auth-divider"><span>or {isSignup ? 'sign up' : 'sign in'} with email</span></div>

          <form onSubmit={emailAuth} className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email" placeholder="you@example.com" value={email} required
                autoComplete="email" onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password" placeholder={isSignup ? 'At least 6 characters' : '••••••••'} value={password} required
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={6} onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <span className="auth-spinner" /> : (isSignup ? 'Create account' : 'Sign in')}
            </button>
          </form>

          {error && <div className="auth-error">{error}</div>}

          <p className="auth-toggle-row">
            {isSignup ? 'Already have an account?' : 'New to life?'}
            <button
              type="button" className="auth-toggle"
              onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError('') }}
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// Left-side brand showcase: a calm, animated nod to the roadmap aesthetic.
function ShowcasePanel() {
  return (
    <div className="auth-showcase" aria-hidden>
      <div className="showcase-grid" />
      <div className="showcase-glow" />

      <div className="showcase-content">
        <div className="showcase-brand">
          <span className="auth-mark"><span className="auth-mark-dot" /></span>
          <span className="showcase-wordmark">life</span>
        </div>

        <p className="showcase-eyebrow">The learning atlas</p>
        <h2 className="showcase-headline">
          Chart what you’re learning like a transit map.
        </h2>
        <p className="showcase-tagline">
          Every roadmap becomes a line. Topics are stations, prerequisites are the track, and a glowing marker always shows your next stop.
        </p>

        {/* Miniature transit-map diagram */}
        <svg className="showcase-diagram" viewBox="0 0 360 220" fill="none">
          <line className="sc-spine" x1="180" y1="20" x2="180" y2="200" />
          <path className="sc-edge" d="M180 50 C 140 50, 120 60, 96 60" />
          <path className="sc-edge" d="M180 110 C 220 110, 240 110, 264 110" />
          <path className="sc-edge" d="M180 170 C 140 170, 120 160, 96 160" />
          <path className="sc-dep" d="M96 60 C 96 120, 230 70, 264 108" />
          <circle className="sc-bead-ring" cx="180" cy="50" r="6" />
          <circle className="sc-bead-ring" cx="180" cy="110" r="6" />
          <circle className="sc-bead-ring" cx="180" cy="170" r="6" />
          <circle className="sc-bead" cx="180" cy="50" r="3.5" />
          <circle className="sc-bead" cx="180" cy="110" r="3.5" />
          <circle className="sc-bead" cx="180" cy="170" r="3.5" />
          <g className="sc-node sc-node-next">
            <rect x="20" y="44" width="76" height="32" rx="4" />
            <circle cx="33" cy="60" r="3.5" className="sc-check" />
          </g>
          <g className="sc-node">
            <rect x="264" y="94" width="76" height="32" rx="4" />
            <circle cx="277" cy="110" r="3.5" className="sc-check" />
          </g>
          <g className="sc-node">
            <rect x="20" y="144" width="76" height="32" rx="4" />
            <circle cx="33" cy="160" r="3.5" className="sc-check" />
          </g>
        </svg>

        <div className="showcase-foot">
          <span className="sc-pill">Roadmaps</span>
          <span className="sc-pill">Prerequisites</span>
          <span className="sc-pill">Next stop</span>
        </div>
      </div>
    </div>
  )
}

function prettyError(e) {
  const code = (e && e.code) || ''
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-email': 'That email looks invalid.',
    'auth/email-already-in-use': 'That email is already registered — sign in instead.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Popup blocked — allow popups and try again.',
    'auth/too-many-requests': 'Too many attempts. Try again in a bit.',
  }
  return map[code] || (e && e.message) || 'Something went wrong.'
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
