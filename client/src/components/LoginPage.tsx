import { useState } from 'react'
import { LogIn, Mail, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './LoginPage.css'

export function LoginPage() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    authError,
    clearAuthError,
  } = useAuth()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearAuthError()
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
      }
    } catch {
      /* error shown via authError */
    } finally {
      setSubmitting(false)
    }
  }

  const onGoogle = async () => {
    clearAuthError()
    setSubmitting(true)
    try {
      await signInWithGoogle()
    } catch {
      /* error shown via authError */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__icon">
          <Shield size={32} strokeWidth={1.5} />
        </div>
        <h1>DocRisk Sri Lanka</h1>
        <p className="login-card__subtitle">
          Sign in to analyze documents and save your results securely.
        </p>

        <button
          type="button"
          className="btn btn-google"
          onClick={onGoogle}
          disabled={submitting}
        >
          <LogIn size={18} />
          Continue with Google
        </button>

        <div className="login-divider">
          <span>or use email</span>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label className="login-label">
            Email
            <div className="login-input-wrap">
              <Mail size={18} />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label className="login-label">
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="login-input"
            />
          </label>

          {authError && <p className="login-error">{authError}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className="login-toggle">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  clearAuthError()
                  setMode('signup')
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  clearAuthError()
                  setMode('signin')
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
