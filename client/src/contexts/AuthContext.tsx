import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../lib/firebase'

function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.'
    default:
      return 'Authentication failed. Please try again.'
  }
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  firebaseEnabled: boolean
  authError: string | null
  clearAuthError: () => void
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  getIdToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('Firebase is not configured.')
    setAuthError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      setAuthError(mapAuthError(code))
      throw err
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase is not configured.')
    setAuthError(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      setAuthError(mapAuthError(code))
      throw err
    }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase is not configured.')
    setAuthError(null)
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      setAuthError(mapAuthError(code))
      throw err
    }
  }, [])

  const logout = useCallback(async () => {
    if (!auth) return
    await signOut(auth)
  }, [])

  const getIdToken = useCallback(async () => {
    if (!user) return null
    return user.getIdToken()
  }, [user])

  const value = useMemo(
    () => ({
      user,
      loading,
      firebaseEnabled: isFirebaseConfigured,
      authError,
      clearAuthError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      logout,
      getIdToken,
    }),
    [
      user,
      loading,
      authError,
      clearAuthError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      logout,
      getIdToken,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
