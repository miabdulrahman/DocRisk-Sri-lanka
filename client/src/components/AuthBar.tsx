import { LogIn, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './AuthBar.css'

export function AuthBar() {
  const { user, loading, firebaseEnabled, signInWithGoogle, logout } = useAuth()

  if (!firebaseEnabled) return null

  if (loading) {
    return <div className="auth-bar auth-bar--loading">Checking sign-in…</div>
  }

  return (
    <div className="auth-bar">
      {user ? (
        <>
          <span className="auth-bar__email" title={user.email ?? undefined}>
            {user.displayName ?? user.email ?? 'Signed in'}
          </span>
          <button type="button" className="btn btn-ghost auth-bar__btn" onClick={logout}>
            <LogOut size={16} />
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost auth-bar__btn" onClick={signInWithGoogle}>
          <LogIn size={16} />
          Sign in with Google
        </button>
      )}
    </div>
  )
}
