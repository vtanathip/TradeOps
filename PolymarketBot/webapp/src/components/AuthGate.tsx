import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type User } from 'firebase/auth'
import { auth } from '../firebase'

const ALLOWED_EMAIL = 'tanathip.se@gmail.com'
const provider = new GoogleAuthProvider()

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | 'loading'>('loading')

  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u))
  }, [])

  if (user === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-label="Loading">
        <svg aria-hidden="true" className="w-6 h-6 text-zinc-700 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeOpacity=".25" />
          <path d="M14 8a6 6 0 0 0-6-6" />
        </svg>
      </div>
    )
  }

  if (user && user.email !== ALLOWED_EMAIL) {
    void signOut(auth)
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="surface p-8 text-center max-w-sm mx-4" role="alert">
          <p className="text-sm font-semibold text-red-400 mb-1">Access denied</p>
          <p className="text-xs text-zinc-400">{user.email} is not authorised to use this app.</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  return <>{children}</>
}

function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSignIn() {
    setLoading(true)
    setError(null)
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="surface p-8 w-full max-w-sm mx-4">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0" aria-hidden="true">
            <svg className="w-4 h-4 text-black" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm7-6a6 6 0 0 0 0 12A6 6 0 0 0 8 2zm.5 3.5v3.25l2.5 1.5-.75 1.25L7.5 9.5V5.5h1z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Polymarket Bot</p>
            <p className="text-[11px] text-zinc-400">Strategy Dashboard</p>
          </div>
        </div>

        <p className="text-xs text-zinc-400 mb-5">Sign in to continue</p>

        <button
          onClick={() => void handleSignIn()}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-zinc-100 active:bg-zinc-200 text-zinc-900 text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        >
          {loading ? (
            <>
              <svg aria-hidden="true" className="w-4 h-4 animate-spin text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6" strokeOpacity=".25" />
                <path d="M14 8a6 6 0 0 0-6-6" />
              </svg>
              Signing in…
            </>
          ) : (
            <>
              <svg aria-hidden="true" className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <p className="mt-3 text-[11px] text-red-400 text-center" role="alert">{error}</p>
        )}

      </div>
    </div>
  )
}
