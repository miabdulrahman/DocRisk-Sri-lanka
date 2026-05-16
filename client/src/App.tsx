import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  BarChart3,
  Calendar,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  FileAudio,
  FileText,
  Filter,
  History,
  Layers,
  LogOut,
  Mail,
  Menu,
  Mic,
  MicOff,
  Moon,
  RotateCcw,
  Square,
  ScanSearch,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { auth, isFirebaseConfigured } from './lib/firebase'
import { ResultDashboard } from './components/DocumentAnalysisResult'
import AdminDashboard from './pages/AdminDashboard'
import GuardianActivityPage from './pages/GuardianActivityPage'
import GuardianCheckDetail from './pages/GuardianCheckDetail'
import GuardianDashboard from './pages/GuardianDashboard'
import GuardianHistory from './pages/GuardianHistory'
import MemberCheckPage from './pages/MemberCheckPage'
import { LanguageSelector } from './components/LanguageSelector'
import { Dashboard, type AnalysisCompletePayload } from './pages/Dashboard'
import { getApiBase } from './lib/apiBase'
import { ScamCard } from './components/ScamCard'
import { ScamChatModal } from './components/ScamChatModal'
import type { ScamEntry } from './utils/scamData'
import { useOfficialScams } from './hooks/useOfficialScams'
import { useUserAnalyses } from './hooks/useUserAnalyses'
import { summarizeAnalyses } from './lib/userAnalyses'
import { timeAgo } from './lib/timeAgo'
import type { OutputLang, RiskLevel } from './types'
import './App.css'

// ── Theme ─────────────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('docrisk-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem('docrisk-theme', theme) } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── Auth helpers ──────────────────────────────────────────────────────────────
function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address.'
    case 'auth/user-disabled': return 'This account has been disabled.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.'
    case 'auth/email-already-in-use': return 'An account with this email already exists.'
    case 'auth/weak-password': return 'Password must be at least 6 characters.'
    case 'auth/operation-not-allowed': return 'Email/password sign-in is not enabled.'
    default: return 'Authentication failed. Please try again.'
  }
}

function parseAuthError(err: unknown): { code: string; message: string; friendly: string } {
  if (err instanceof FirebaseError) {
    return { code: err.code, message: err.message, friendly: mapAuthError(err.code) }
  }
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : 'unknown'
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err)
  return { code, message, friendly: mapAuthError(code) }
}

type Tab = 'analyze' | 'audio' | 'history' | 'reports' | 'settings'

// ══════════════════════════════════════════════════════════════════════════════
// App
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => { applyTheme(theme) }, [theme])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (authLoading) {
    return (
      <div className="app-loading" role="status" aria-busy="true">
        <div className="app-loading__ambient" aria-hidden />
        <div className="app-loading__rings" aria-hidden>
          <span className="app-loading__orbit" />
          <span className="app-loading__orbit app-loading__orbit--delayed" />
        </div>
        <div className="app-loading__pulse" aria-hidden />
        <div className="app-loading__core">
          <div className="spinner" aria-hidden />
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/check" element={<MemberCheckPage />} />
        {user ? (
          <>
            <Route path="/admin" element={<AdminDashboard user={user} />} />
            <Route path="/guardian/history" element={<GuardianHistory user={user} />} />
            <Route path="/guardian/activity" element={<GuardianActivityPage user={user} />} />
            <Route path="/guardian/check/:requestId" element={<GuardianCheckDetail user={user} />} />
            <Route path="/guardian" element={<GuardianDashboard user={user} />} />
            <Route
              path="/*"
              element={<MainLayout user={user} theme={theme} onToggleTheme={toggleTheme} />}
            />
          </>
        ) : (
          <Route path="*" element={<AuthForm theme={theme} onToggleTheme={toggleTheme} />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Auth Form
// ══════════════════════════════════════════════════════════════════════════════
function AuthForm({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<{ code: string; message: string; friendly: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err) {
      setAuthError(parseAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <button className="theme-toggle theme-toggle--auth" onClick={onToggleTheme} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo__icon">
            <ShieldCheck size={24} strokeWidth={1.5} />
          </span>
          <div>
            <p className="auth-logo__brand">DocRisk</p>
            <p className="auth-logo__sub">Sri Lanka</p>
          </div>
        </div>
        <h1 className="auth-heading">
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subheading">
          {mode === 'signin'
            ? 'Sign in to analyze documents for fraud.'
            : 'Get started with DocRisk Sri Lanka.'}
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <div className="auth-input-wrap">
              <Mail size={16} />
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

          <label className="auth-field">
            <span>Password</span>
            <div className="auth-input-wrap">
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
          </label>

          {authError && (
            <div className="auth-error" role="alert">
              <p className="auth-error__title">{authError.friendly}</p>
              <p className="auth-error__detail"><strong>Code:</strong> {authError.code}</p>
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={() => { setAuthError(null); setMode('signup') }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={() => { setAuthError(null); setMode('signin') }}
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

// ══════════════════════════════════════════════════════════════════════════════
// Main Layout
// ══════════════════════════════════════════════════════════════════════════════
function MainLayout({
  user,
  theme,
  onToggleTheme,
}: {
  user: User
  theme: Theme
  onToggleTheme: () => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>('analyze')
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!profileOpen) return
    function handleDocMouse(e: MouseEvent) {
      const el = profileWrapRef.current
      if (el && !el.contains(e.target as Node)) setProfileOpen(false)
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleDocMouse)
    window.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleDocMouse)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [profileOpen])

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setMobileOpen(false)
    setProfileOpen(false)
  }

  return (
    <div className="app-root">
      <div className="main-col">
        <TopNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          scrolled={scrolled}
          theme={theme}
          onToggleTheme={onToggleTheme}
          user={user}
          mobileOpen={mobileOpen}
          onMobileToggle={() => setMobileOpen((o) => !o)}
          profileWrapRef={profileWrapRef}
          profileOpen={profileOpen}
          onProfileToggle={() => {
            setMobileOpen(false)
            setProfileOpen((o) => !o)
          }}
          onProfileSettings={() => handleTabChange('settings')}
          onProfileLogout={() => {
            setProfileOpen(false)
            void signOut(auth)
          }}
        />
        <MobileMenu
          open={mobileOpen}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onLogout={() => signOut(auth)}
          onClose={() => setMobileOpen(false)}
        />
        <main className="page">
          {activeTab === 'analyze' && <AnalyzeTab user={user} />}
          {activeTab === 'audio' && <AudioTab />}
          {activeTab === 'history' && <HistoryTab user={user} />}
          {activeTab === 'reports' && <ReportsTab user={user} />}
          {activeTab === 'settings' && (
            <SettingsTab theme={theme} onToggleTheme={onToggleTheme} />
          )}
        </main>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Top Nav
// ══════════════════════════════════════════════════════════════════════════════
const MAIN_NAV_TABS: { id: Tab; label: string }[] = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'audio', label: 'Audio Verification' },
  { id: 'history', label: 'History' },
  { id: 'reports', label: 'Reports' },
]

function TopNav({
  activeTab,
  onTabChange,
  scrolled,
  theme,
  onToggleTheme,
  user,
  mobileOpen,
  onMobileToggle,
  profileWrapRef,
  profileOpen,
  onProfileToggle,
  onProfileSettings,
  onProfileLogout,
}: {
  activeTab: Tab
  onTabChange: (t: Tab) => void
  scrolled: boolean
  theme: Theme
  onToggleTheme: () => void
  user: User
  mobileOpen: boolean
  onMobileToggle: () => void
  profileWrapRef: React.RefObject<HTMLDivElement | null>
  profileOpen: boolean
  onProfileToggle: () => void
  onProfileSettings: () => void
  onProfileLogout: () => void
}) {
  const displayEmail = user.email ?? 'Signed in'

  return (
    <nav className={`top-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-brand">
        <span className="nav-logo">
          <ShieldCheck size={18} strokeWidth={1.5} />
        </span>
        <span className="nav-brand-name">DocRisk</span>
        <span className="nav-brand-sub">Sri Lanka</span>
      </div>

      <div className="nav-tabs">
        {MAIN_NAV_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab${activeTab === tab.id ? ' nav-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <NavLink
          to="/guardian"
          className={({ isActive }) => `nav-tab${isActive ? ' nav-tab--active' : ''}`}
        >
          My Circle
        </NavLink>
      </div>

      <div className="nav-right">
        <button className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="profile-menu" ref={profileWrapRef}>
          <button
            type="button"
            className={`user-chip-trigger${profileOpen ? ' user-chip-trigger--open' : ''}${activeTab === 'settings' ? ' user-chip-trigger--settings' : ''}`}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            id="profile-menu-trigger"
            onClick={onProfileToggle}
          >
            <div className="user-avatar" aria-hidden>
              {(displayEmail?.[0] ?? 'U').toUpperCase()}
            </div>
            <span className="user-name">{displayEmail}</span>
            <ChevronDown
              size={16}
              className={`user-chip-trigger__caret${profileOpen ? ' user-chip-trigger__caret--open' : ''}`}
              aria-hidden
            />
          </button>
          {profileOpen && (
            <div className="profile-menu__dropdown" role="menu" aria-labelledby="profile-menu-trigger">
              <div className="profile-menu__header">
                <p className="profile-menu__hint">Signed in as</p>
                <p className="profile-menu__email">{displayEmail}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                className={`profile-menu__item${activeTab === 'settings' ? ' profile-menu__item--active' : ''}`}
                onClick={onProfileSettings}
              >
                <Settings size={17} aria-hidden />
                Settings
              </button>
              <button
                type="button"
                role="menuitem"
                className="profile-menu__item profile-menu__item--danger"
                onClick={onProfileLogout}
              >
                <LogOut size={17} aria-hidden />
                Log out
              </button>
            </div>
          )}
        </div>
        <button className="hamburger" onClick={onMobileToggle} aria-label="Toggle menu">
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </nav>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Mobile Menu
// ══════════════════════════════════════════════════════════════════════════════
const MOBILE_NAV_ICONS: Record<Tab, React.ComponentType<{ size?: number }>> = {
  analyze: ScanSearch,
  audio: AudioWaveform,
  history: History,
  reports: BarChart3,
  settings: Settings,
}

function MobileMenu({
  open,
  activeTab,
  onTabChange,
  onLogout,
  onClose,
}: {
  open: boolean
  activeTab: Tab
  onTabChange: (t: Tab) => void
  onLogout: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const items: { id: Tab; label: string }[] = [
    ...MAIN_NAV_TABS,
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <>
      <div
        className={`mobile-menu-backdrop${open ? ' mobile-menu-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`mobile-menu${open ? ' mobile-menu--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="mobile-menu__head">
          <span className="mobile-menu__head-label">Menu</span>
          <button className="mobile-menu__close" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="mobile-menu__nav">
          {items.map((tab) => {
            const Icon = MOBILE_NAV_ICONS[tab.id]
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                className={`mobile-menu-item${active ? ' mobile-menu-item--active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="mobile-menu-item__icon">
                  <Icon size={18} />
                </span>
                <span className="mobile-menu-item__label">{tab.label}</span>
                <ChevronRight size={16} className="mobile-menu-item__chevron" />
              </button>
            )
          })}
          <Link to="/guardian" className="mobile-menu-item" onClick={onClose}>
            <span className="mobile-menu-item__icon">
              <Users size={18} />
            </span>
            <span className="mobile-menu-item__label">My Circle</span>
            <ChevronRight size={16} className="mobile-menu-item__chevron" />
          </Link>
        </nav>
        <div className="mobile-menu__footer">
          <button className="mobile-menu-item mobile-menu-item--danger" onClick={onLogout}>
            <span className="mobile-menu-item__icon">
              <LogOut size={18} />
            </span>
            <span className="mobile-menu-item__label">Log out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Analyze Tab
// ══════════════════════════════════════════════════════════════════════════════
function AnalyzeTab({ user }: { user: User }) {
  const [outputLang, setOutputLang] = useState<OutputLang>('english')
  const [analysis, setAnalysis] = useState<AnalysisCompletePayload | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedScam, setSelectedScam] = useState<ScamEntry | null>(null)
  const { scams, loading: scamsLoading, error: scamsError, sources, fetchedAt, reload: reloadScams } = useOfficialScams()

  const clearAnalysis = () => {
    setAnalysis(null)
    setAnalyzing(false)
  }

  if (analysis) {
    return (
      <ResultDashboard
        result={analysis.result}
        file={analysis.file}
        previewUrl={analysis.previewUrl}
        outputLang={analysis.outputLang}
        onReset={clearAnalysis}
      />
    )
  }

  return (
    <>
      {selectedScam && (
        <ScamChatModal scam={selectedScam} onClose={() => setSelectedScam(null)} />
      )}
      <div className="analyze-tab">
        <LanguageSelector value={outputLang} onChange={setOutputLang} />
        {analyzing && <SkeletonLoader />}
        <div className={analyzing ? 'analyze-tab__upload analyze-tab__upload--hidden' : 'analyze-tab__upload'}>
          <Dashboard
            user={user}
            outputLang={outputLang}
            onAnalyzingChange={setAnalyzing}
            onResult={setAnalysis}
          />
        </div>

        {!analyzing && (
          <section className="scam-alert-section">
            <div className="scam-alert-header">
              <div className="scam-alert-header__icon">
                <AlertTriangle size={15} />
              </div>
              <div className="scam-alert-header__body">
                <div className="scam-alert-header__title-row">
                  <h2 className="scam-alert-header__title">Official Scam Advisories — Sri Lanka</h2>
                  <span className="scam-live-badge" aria-label="Live data">
                    <span className="scam-live-dot" aria-hidden />
                    LIVE
                  </span>
                </div>
                <div className="scam-alert-header__meta-row">
                  <p className="scam-alert-header__sub">
                    {sources.length > 0 ? sources.join(' · ') : 'SLCERT · Sri Lanka Police · Google News'}
                    {' '}— click a card to learn more or chat with an AI expert
                  </p>
                  {fetchedAt && !scamsLoading && (
                    <span className="scam-alert-header__fetched">
                      {timeAgo(fetchedAt)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="scam-alert-refresh"
                    onClick={() => void reloadScams()}
                    disabled={scamsLoading}
                    aria-label="Refresh advisories"
                    title="Refresh"
                  >
                    <RotateCcw size={12} className={scamsLoading ? 'scam-alert-refresh--spinning' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {scamsLoading && (
              <p className="scam-alert-status" role="status">Fetching live advisories…</p>
            )}

            {!scamsLoading && scamsError && (
              <div className="scam-alert-status scam-alert-status--error" role="alert">
                <p>{scamsError}</p>
                <button type="button" className="scam-alert-retry" onClick={() => void reloadScams()}>
                  Retry
                </button>
              </div>
            )}

            {!scamsLoading && !scamsError && scams.length === 0 && (
              <p className="scam-alert-status">No advisories available right now.</p>
            )}

            {!scamsLoading && scams.length > 0 && (
              <div className="scam-alert-grid">
                {scams.map((scam, i) => (
                  <ScamCard
                    key={scam.id}
                    scam={scam}
                    onReadMore={setSelectedScam}
                    index={i}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  )
}

// Skeleton Loader
// ══════════════════════════════════════════════════════════════════════════════
function SkeletonLoader() {
  const [step, setStep] = useState(0)
  const steps = [
    "Extracting document text...",
    "Verifying official seals...",
    "Cross-referencing formatting...",
    "Calculating fraud risk score..."
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % steps.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="scanning-loader-wrap">
      <div className="scanning-document">
        <div className="scanning-laser" />
        <FileText size={64} strokeWidth={1} className="scanning-icon" />
      </div>
      <h3 className="scanning-title">AI is Analyzing</h3>
      <p className="scanning-step">{steps[step]}</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Audio Verification Tab
// ══════════════════════════════════════════════════════════════════════════════
type AudioVerdict = 'Authentic' | 'Suspicious' | 'Altered'

type AudioAnalysis = {
  authenticity_score: number
  verdict: AudioVerdict
  detected_anomalies: string[]
  summary: string
  technical_explanation: string
}

const ACCEPTED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
])

function isAcceptedAudio(file: File): boolean {
  if (ACCEPTED_AUDIO_MIMES.has(file.type)) return true
  if (file.type.startsWith('audio/webm') || file.type.startsWith('audio/ogg')) return true
  const name = file.name.toLowerCase()
  return name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.webm') || name.endsWith('.ogg')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function verdictTone(v: AudioVerdict): { color: string; bg: string; ring: string } {
  switch (v) {
    case 'Authentic':
      return { color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', ring: 'rgba(52, 211, 153, 0.35)' }
    case 'Suspicious':
      return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', ring: 'rgba(251, 191, 36, 0.35)' }
    case 'Altered':
      return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)', ring: 'rgba(239, 68, 68, 0.4)' }
  }
}

function AudioTab() {
  const [inputMode, setInputMode] = useState<'upload' | 'record'>('record')
  const [file, setFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AudioAnalysis | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      cleanupRecording()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  const cleanupRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    mediaRecorderRef.current = null
    recordingChunksRef.current = []
    timerRef.current = null
  }

  const reset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setFile(null)
    setAudioUrl(null)
    setResult(null)
    setError(null)
    setLoading(false)
    setIsRecording(false)
    setRecordingSeconds(0)
    cleanupRecording()
    if (inputRef.current) inputRef.current.value = ''
  }

  const acceptFile = (next: File | null) => {
    if (!next) return
    if (!isAcceptedAudio(next)) {
      setError('Unsupported file. Upload an MP3 or WAV audio clip.')
      return
    }
    if (next.size > 10 * 1024 * 1024) {
      setError('Audio file must be 10 MB or smaller.')
      return
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setError(null)
    setResult(null)
    setFile(next)
    setAudioUrl(URL.createObjectURL(next))
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      recordingChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }

      mr.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: mimeType || 'audio/webm',
        })
        const ext = mimeType.includes('webm') ? 'webm' : 'wav'
        const recorded = new File([blob], `recording-${Date.now()}.${ext}`, {
          type: blob.type,
        })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setError(null)
        setResult(null)
        setFile(recorded)
        setAudioUrl(URL.createObjectURL(recorded))
        cleanupRecording()
        setIsRecording(false)
      }

      mr.start(250)
      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone permission and try again.'
          : 'Could not access microphone. Please check your device settings.',
      )
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }

  const fmtSeconds = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const onAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('audio', file)
      const base = getApiBase()
      const res = await fetch(`${base}/api/analyze-audio`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error ?? `Request failed (${res.status}).`)
      }
      setResult(data.analysis as AudioAnalysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze audio.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="audio-tab">
      <header className="audio-hero">
        <span className="audio-hero__eyebrow">
          <AudioWaveform size={13} /> Voice fraud forensics
        </span>
        <h2 className="audio-hero__title">Audio Verification</h2>
        <p className="audio-hero__sub">
          Detect voice deepfakes, splicing, and replay attacks. Upload a file or record directly — Gemini
          will inspect background noise, synthetic speech artifacts, and unnatural cadence on local Sri
          Lankan words and identification numbers.
        </p>
      </header>

      {!result && !loading && (
        <>
          {/* Mode toggle */}
          {!file && !isRecording && (
            <div className="audio-mode-tabs">
              <button
                type="button"
                className={`audio-mode-tab${inputMode === 'upload' ? ' audio-mode-tab--active' : ''}`}
                onClick={() => { setInputMode('upload'); reset() }}
              >
                <Upload size={14} />
                Upload file
              </button>
              <button
                type="button"
                className={`audio-mode-tab${inputMode === 'record' ? ' audio-mode-tab--active' : ''}`}
                onClick={() => { setInputMode('record'); reset() }}
              >
                <Mic size={14} />
                Record audio
              </button>
            </div>
          )}

          {/* Upload mode */}
          {inputMode === 'upload' && (
            <section
              className={`audio-dropzone${dragActive ? ' audio-dropzone--active' : ''}${file ? ' audio-dropzone--filled' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) acceptFile(dropped)
              }}
              onClick={() => {
                if (!file) inputRef.current?.click()
              }}
              role="button"
              tabIndex={0}
            >
              <input
                ref={inputRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,.mp3,.wav"
                className="audio-dropzone__input"
                onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
              />

              {!file ? (
                <div className="audio-dropzone__empty">
                  <div className="audio-dropzone__icon-stack" aria-hidden>
                    <span className="audio-dropzone__pulse" />
                    <span className="audio-dropzone__pulse audio-dropzone__pulse--delay" />
                    <span className="audio-dropzone__icon">
                      <AudioWaveform size={36} strokeWidth={1.5} />
                    </span>
                  </div>
                  <p className="audio-dropzone__title">Drop your audio file here</p>
                  <p className="audio-dropzone__hint">MP3 or WAV · up to 10 MB</p>
                  <button type="button" className="btn btn-primary audio-dropzone__cta">
                    <Upload size={15} />
                    Choose audio file
                  </button>
                </div>
              ) : (
                <div className="audio-dropzone__filled">
                  <div className="audio-file">
                    <span className="audio-file__icon">
                      <FileAudio size={22} />
                    </span>
                    <div className="audio-file__meta">
                      <p className="audio-file__name">{file.name}</p>
                      <p className="audio-file__sub">
                        {formatBytes(file.size)} · {file.type || 'audio'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="audio-file__clear"
                      onClick={(e) => {
                        e.stopPropagation()
                        reset()
                      }}
                      aria-label="Remove file"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {audioUrl && (
                    <div className="audio-player">
                      <div className="audio-player__waves" aria-hidden>
                        {Array.from({ length: 32 }).map((_, i) => (
                          <span key={i} style={{ animationDelay: `${i * 60}ms` }} />
                        ))}
                      </div>
                      <audio
                        src={audioUrl}
                        controls
                        preload="metadata"
                        className="audio-player__el"
                      />
                    </div>
                  )}

                  <div className="audio-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-ghost" onClick={reset}>
                      <RotateCcw size={14} />
                      Replace
                    </button>
                    <button type="button" className="btn btn-primary" onClick={onAnalyze}>
                      <Mic size={15} />
                      Analyze audio
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Record mode */}
          {inputMode === 'record' && !file && (
            <section className={`audio-recorder${isRecording ? ' audio-recorder--active' : ''}`}>
              {!isRecording ? (
                <div className="audio-recorder__idle">
                  <div className="audio-recorder__ring-wrap" aria-hidden>
                    <span className="audio-recorder__ring" />
                    <span className="audio-recorder__ring audio-recorder__ring--delay" />
                    <span className="audio-recorder__mic-btn" onClick={startRecording}>
                      <Mic size={38} strokeWidth={1.5} />
                    </span>
                  </div>
                  <p className="audio-recorder__title">Tap to start recording</p>
                  <p className="audio-recorder__hint">Your microphone will be used</p>
                  <button type="button" className="btn btn-primary" onClick={startRecording}>
                    <Mic size={15} />
                    Start recording
                  </button>
                </div>
              ) : (
                <div className="audio-recorder__live">
                  <div className="audio-recorder__live-bars" aria-hidden>
                    {Array.from({ length: 20 }).map((_, i) => (
                      <span key={i} style={{ animationDelay: `${i * 55}ms` }} />
                    ))}
                  </div>
                  <div className="audio-recorder__live-center">
                    <span className="audio-recorder__dot" aria-hidden />
                    <span className="audio-recorder__timer">{fmtSeconds(recordingSeconds)}</span>
                    <span className="audio-recorder__live-label">Recording…</span>
                  </div>
                  <button
                    type="button"
                    className="btn audio-recorder__stop-btn"
                    onClick={stopRecording}
                    aria-label="Stop recording"
                  >
                    <Square size={14} fill="currentColor" />
                    Stop &amp; review
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Recorded file ready — shared player + actions */}
          {inputMode === 'record' && file && (
            <section className="audio-dropzone audio-dropzone--filled">
              <div className="audio-dropzone__filled">
                <div className="audio-file">
                  <span className="audio-file__icon">
                    <Mic size={22} />
                  </span>
                  <div className="audio-file__meta">
                    <p className="audio-file__name">Recorded clip</p>
                    <p className="audio-file__sub">
                      {formatBytes(file.size)} · {file.type || 'audio/webm'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="audio-file__clear"
                    onClick={reset}
                    aria-label="Discard recording"
                  >
                    <X size={15} />
                  </button>
                </div>

                {audioUrl && (
                  <div className="audio-player">
                    <div className="audio-player__waves" aria-hidden>
                      {Array.from({ length: 32 }).map((_, i) => (
                        <span key={i} style={{ animationDelay: `${i * 60}ms` }} />
                      ))}
                    </div>
                    <audio
                      src={audioUrl}
                      controls
                      preload="metadata"
                      className="audio-player__el"
                    />
                  </div>
                )}

                <div className="audio-actions">
                  <button type="button" className="btn btn-ghost" onClick={reset}>
                    <MicOff size={14} />
                    Re-record
                  </button>
                  <button type="button" className="btn btn-primary" onClick={onAnalyze}>
                    <Mic size={15} />
                    Analyze audio
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {error && !loading && (
        <div className="audio-error" role="alert">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="audio-loading" role="status" aria-busy="true">
          <div className="audio-loading__spectrum" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <p className="audio-loading__title">Analyzing Audio Spectrum...</p>
          <p className="audio-loading__sub">
            Scanning for splice points, synthetic artifacts, and replay signatures.
          </p>
        </div>
      )}

      {result && !loading && (
        <AudioResultCard
          analysis={result}
          fileName={file?.name ?? 'Audio clip'}
          audioUrl={audioUrl}
          onReset={reset}
        />
      )}
    </div>
  )
}

function AudioResultCard({
  analysis,
  fileName,
  audioUrl,
  onReset,
}: {
  analysis: AudioAnalysis
  fileName: string
  audioUrl: string | null
  onReset: () => void
}) {
  const tone = verdictTone(analysis.verdict)
  const score = Math.min(100, Math.max(0, analysis.authenticity_score))

  // Radial gauge math (3/4 ring)
  const R = 72
  const C = 2 * Math.PI * R
  const visible = 0.75 * C
  const dash = (score / 100) * visible

  return (
    <div className="audio-result">
      <section
        className="result-card audio-result__card"
        style={{ '--delay': '0ms' } as React.CSSProperties}
      >
        <div className="audio-result__head">
          <div>
            <h2 className="audio-result__title">Audio forensic analysis</h2>
            <p className="audio-result__file">{fileName}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onReset}>
            <RotateCcw size={14} />
            Analyze another
          </button>
        </div>

        <div className="audio-result__grid">
          <div className="audio-gauge" style={{ '--ring': tone.ring } as React.CSSProperties}>
            <svg viewBox="0 0 200 200" className="audio-gauge__svg" aria-label={`Authenticity ${score} out of 100`}>
              <defs>
                <filter id="audio-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke="var(--surface-2, rgba(255,255,255,0.08))"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${visible} ${C - visible}`}
                strokeDashoffset={visible / 2}
                transform="rotate(90 100 100)"
              />
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={tone.color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={visible / 2}
                transform="rotate(90 100 100)"
                filter="url(#audio-glow)"
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
              <text
                x="100"
                y="96"
                textAnchor="middle"
                fill={tone.color}
                fontSize="38"
                fontWeight="800"
                fontFamily="Inter, sans-serif"
              >
                {score.toFixed(1)}
              </text>
              <text
                x="100"
                y="118"
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="11"
                fontWeight="600"
                letterSpacing="1.5"
                fontFamily="Inter, sans-serif"
              >
                AUTHENTICITY
              </text>
            </svg>
            <span
              className="audio-gauge__verdict"
              style={{ color: tone.color, background: tone.bg, borderColor: tone.ring }}
            >
              {analysis.verdict === 'Authentic' ? (
                <ShieldCheck size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              {analysis.verdict}
            </span>
          </div>

          <div className="audio-result__summary">
            <h3 className="section-label">Summary</h3>
            <p className="audio-result__summary-text">{analysis.summary || 'No summary returned.'}</p>

            {audioUrl && (
              <div className="audio-result__player">
                <audio src={audioUrl} controls preload="metadata" />
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="result-card audio-result__anomalies"
        style={{ '--delay': '80ms' } as React.CSSProperties}
      >
        <div className="audio-result__sub-head">
          <span className="audio-result__sub-icon" style={{ color: tone.color, background: tone.bg }}>
            <AlertTriangle size={16} />
          </span>
          <div>
            <h3 className="audio-result__sub-title">Acoustic anomalies</h3>
            <p className="audio-result__sub-sub">
              {analysis.detected_anomalies.length} forensic{' '}
              {analysis.detected_anomalies.length === 1 ? 'finding' : 'findings'}
            </p>
          </div>
        </div>
        {analysis.detected_anomalies.length === 0 ? (
          <p className="audio-result__empty">
            <ShieldCheck size={14} style={{ color: '#34d399' }} />
            No acoustic anomalies detected. The clip appears consistent.
          </p>
        ) : (
          <ul className="audio-anomaly-list">
            {analysis.detected_anomalies.map((item, i) => (
              <li
                key={i}
                className="audio-anomaly"
                style={{
                  borderLeftColor: tone.color,
                  animationDelay: `${i * 70}ms`,
                }}
              >
                <AlertTriangle size={15} style={{ color: tone.color }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="result-card audio-result__tech"
        style={{ '--delay': '140ms' } as React.CSSProperties}
      >
        <div className="audio-result__sub-head">
          <span className="audio-result__sub-icon audio-result__sub-icon--violet">
            <ScanSearch size={16} />
          </span>
          <div>
            <h3 className="audio-result__sub-title">Technical breakdown</h3>
            <p className="audio-result__sub-sub">Detailed forensic acoustics</p>
          </div>
        </div>
        <div className="audio-result__tech-body">
          {analysis.technical_explanation || 'No technical explanation provided.'}
        </div>
      </section>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// History / Reports / Settings tabs
// ══════════════════════════════════════════════════════════════════════════════
function formatDocTypeUi(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type HistoryFilter = 'all' | RiskLevel

function HistoryTab({ user }: { user: User }) {
  const { items, error, loading } = useUserAnalyses(user.uid)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<HistoryFilter>('all')

  if (!isFirebaseConfigured) {
    return (
      <div className="placeholder-tab">
        <div className="placeholder-card">
          <div className="placeholder-icon">
            <History size={30} strokeWidth={1.25} />
          </div>
          <h2>History needs Firebase</h2>
          <p>
            Configure <code>VITE_FIREBASE_*</code> in <code>client/.env</code> so analyses can be saved and
            listed here.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="analyze-tab">
        <div className="admin-loading">
          <div className="spinner" />
          <p>Loading your history…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analyze-tab">
        <div className="api-error" role="alert">{error}</div>
      </div>
    )
  }

  const rows = items ?? []

  if (rows.length === 0) {
    return (
      <div className="placeholder-tab">
        <div className="placeholder-card">
          <div className="placeholder-icon">
            <History size={30} strokeWidth={1.25} />
          </div>
          <h2>No analysis history yet</h2>
          <p>
            Upload a document under <strong>Analyze</strong>. Each result is saved to your Firestore profile when
            the run completes successfully.
          </p>
        </div>
      </div>
    )
  }

  const counts = {
    all: rows.length,
    low: rows.filter((r) => r.risk_level === 'low').length,
    medium: rows.filter((r) => r.risk_level === 'medium').length,
    high: rows.filter((r) => r.risk_level === 'high').length,
  }

  const filtered = rows.filter((row) => {
    if (filter !== 'all' && row.risk_level !== filter) return false
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      return (
        row.fileName.toLowerCase().includes(q) ||
        row.summary.toLowerCase().includes(q) ||
        row.document_type.toLowerCase().includes(q)
      )
    }
    return true
  })

  const filterChips: { id: HistoryFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
  ]

  return (
    <div className="analyze-tab history-tab">
      <header className="history-hero">
        <div className="history-hero__main">
          <span className="history-hero__eyebrow">
            <History size={13} /> Activity log
          </span>
          <h2 className="history-title">Analysis history</h2>
          <p className="history-sub">
            {rows.length} saved {rows.length === 1 ? 'result' : 'results'} · {counts.high} high-risk
          </p>
        </div>
        <div className="history-hero__stats">
          <div className="history-hero__stat">
            <span className="history-hero__stat-dot history-hero__stat-dot--low" />
            <span className="history-hero__stat-num">{counts.low}</span>
            <span className="history-hero__stat-label">Low</span>
          </div>
          <div className="history-hero__stat">
            <span className="history-hero__stat-dot history-hero__stat-dot--medium" />
            <span className="history-hero__stat-num">{counts.medium}</span>
            <span className="history-hero__stat-label">Med</span>
          </div>
          <div className="history-hero__stat">
            <span className="history-hero__stat-dot history-hero__stat-dot--high" />
            <span className="history-hero__stat-num">{counts.high}</span>
            <span className="history-hero__stat-label">High</span>
          </div>
        </div>
      </header>

      <div className="history-toolbar">
        <div className="history-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder="Search by name, summary, or type…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search analyses"
          />
        </div>
        <div className="history-filter">
          <Filter size={13} aria-hidden />
          <div className="history-filter__pills">
            {filterChips.map((chip) => (
              <button
                key={chip.id}
                className={`history-filter__pill${filter === chip.id ? ' history-filter__pill--active' : ''}`}
                onClick={() => setFilter(chip.id)}
              >
                {chip.label}
                <span className="history-filter__count">{counts[chip.id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="history-empty">
          <Search size={22} />
          <p>No results match your filters.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery('')
              setFilter('all')
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="history-list">
          {filtered.map((row, idx) => (
            <li
              key={row.id}
              className={`history-item history-item--${row.risk_level}`}
              style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
            >
              <div className="history-item__rail" aria-hidden />
              <div className="history-item__icon" aria-hidden>
                <FileText size={18} />
              </div>
              <div className="history-item__body">
                <div className="history-item__head">
                  <p className="history-item__name">{row.fileName}</p>
                  <span
                    className={
                      row.risk_level === 'low'
                        ? 'risk-pill risk-pill--low'
                        : row.risk_level === 'medium'
                          ? 'risk-pill risk-pill--medium'
                          : 'risk-pill risk-pill--high'
                    }
                  >
                    {row.risk_level}
                  </span>
                </div>
                <p className="history-item__summary">{row.summary}</p>
                <div className="history-item__foot">
                  <span className="history-item__chip">
                    <Layers size={12} aria-hidden />
                    {formatDocTypeUi(row.document_type)}
                  </span>
                  <span className="history-item__chip">
                    <Calendar size={12} aria-hidden />
                    {row.createdAt
                      ? new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(row.createdAt)
                      : 'Date unknown'}
                  </span>
                  <span className="history-item__chip history-item__chip--score">
                    <Activity size={12} aria-hidden />
                    Score {(row.risk_score / 10).toFixed(1)}/10
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReportsTab({ user }: { user: User }) {
  const { items, error, loading } = useUserAnalyses(user.uid)
  const entries = items ?? []
  const report = summarizeAnalyses(entries)

  if (!isFirebaseConfigured) {
    return (
      <div className="placeholder-tab">
        <div className="placeholder-card">
          <div className="placeholder-icon">
            <ClipboardList size={30} strokeWidth={1.25} />
          </div>
          <h2>Reports need Firebase</h2>
          <p>
            Add your Firebase web config to <code>client/.env</code> — reports are computed from analyses stored
            under your user ID.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="analyze-tab">
        <div className="admin-loading">
          <div className="spinner" />
          <p>Building your report…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analyze-tab">
        <div className="api-error" role="alert">{error}</div>
      </div>
    )
  }

  if (report.total === 0) {
    return (
      <div className="placeholder-tab">
        <div className="placeholder-card">
          <div className="placeholder-icon">
            <ClipboardList size={30} strokeWidth={1.25} />
          </div>
          <h2>No data for reports yet</h2>
          <p>Analyze at least one document to see trends and summaries here.</p>
        </div>
      </div>
    )
  }

  const riskLevels: RiskLevel[] = ['low', 'medium', 'high']
  const docEntries = Object.entries(report.byType).sort((a, b) => b[1] - a[1])
  const maxDocCount = docEntries.reduce((m, [, c]) => Math.max(m, c), 0)

  // Donut math
  const donutR = 56
  const donutC = 2 * Math.PI * donutR
  let donutOffset = 0
  const donutSegments = riskLevels
    .map((level) => {
      const count = report.riskCounts[level]
      const pct = report.total > 0 ? count / report.total : 0
      const dash = pct * donutC
      const seg = {
        level,
        dash,
        offset: donutOffset,
        count,
        pct: Math.round(pct * 100),
      }
      donutOffset += dash
      return seg
    })
    .filter((s) => s.dash > 0)

  return (
    <div className="analyze-tab reports-tab">
      <header className="reports-hero">
        <div className="reports-hero__intro">
          <span className="reports-hero__eyebrow">
            <Sparkles size={13} /> Insights
          </span>
          <h2 className="history-title">Your reports</h2>
          <p className="history-sub">
            Trends across {report.total} {report.total === 1 ? 'analysis' : 'analyses'} saved to your account.
          </p>
        </div>
      </header>

      <section className="metric-grid">
        <article className="metric-card metric-card--accent">
          <div className="metric-card__head">
            <span className="metric-card__icon">
              <ClipboardList size={16} />
            </span>
            <p className="metric-card__label">Total analyses</p>
          </div>
          <p className="metric-card__value">{report.total}</p>
          <p className="metric-card__hint">Lifetime documents</p>
        </article>
        <article className="metric-card">
          <div className="metric-card__head">
            <span className="metric-card__icon metric-card__icon--violet">
              <TrendingUp size={16} />
            </span>
            <p className="metric-card__label">Avg risk score</p>
          </div>
          <p className="metric-card__value">
            {(report.avgRisk / 10).toFixed(1)}
            <span className="metric-card__unit">/10</span>
          </p>
          <p className="metric-card__hint">{report.avgRisk}/100 raw</p>
        </article>
        <article className="metric-card">
          <div className="metric-card__head">
            <span className="metric-card__icon metric-card__icon--teal">
              <Activity size={16} />
            </span>
            <p className="metric-card__label">Avg confidence</p>
          </div>
          <p className="metric-card__value">
            {report.avgConfidence}
            <span className="metric-card__unit">%</span>
          </p>
          <p className="metric-card__hint">Model certainty</p>
        </article>
        <article className={`metric-card${report.highPct >= 30 ? ' metric-card--danger' : ''}`}>
          <div className="metric-card__head">
            <span className="metric-card__icon metric-card__icon--danger">
              <ShieldAlert size={16} />
            </span>
            <p className="metric-card__label">High-risk share</p>
          </div>
          <p className="metric-card__value">
            {report.highPct}
            <span className="metric-card__unit">%</span>
          </p>
          <p className="metric-card__hint">{report.riskCounts.high} flagged high</p>
        </article>
      </section>

      <div className="reports-row">
        <section className="reports-panel reports-panel--donut">
          <div className="reports-panel__head">
            <h3 className="reports-panel__title">Risk distribution</h3>
            <p className="reports-panel__sub">Share of analyses by risk level</p>
          </div>
          <div className="donut-wrap">
            <svg viewBox="0 0 160 160" className="donut" aria-label="Risk distribution donut">
              <circle
                cx="80"
                cy="80"
                r={donutR}
                fill="none"
                stroke="var(--surface-2)"
                strokeWidth="16"
              />
              {donutSegments.map((seg) => (
                <circle
                  key={seg.level}
                  cx="80"
                  cy="80"
                  r={donutR}
                  fill="none"
                  stroke={
                    seg.level === 'low'
                      ? 'var(--risk-low)'
                      : seg.level === 'medium'
                        ? 'var(--risk-medium)'
                        : 'var(--risk-high)'
                  }
                  strokeWidth="16"
                  strokeLinecap="butt"
                  strokeDasharray={`${seg.dash} ${donutC - seg.dash}`}
                  strokeDashoffset={-seg.offset}
                  transform="rotate(-90 80 80)"
                  style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
              ))}
              <text
                x="80"
                y="76"
                textAnchor="middle"
                fill="var(--text-h)"
                fontSize="22"
                fontWeight="800"
                fontFamily="Inter, sans-serif"
              >
                {report.total}
              </text>
              <text
                x="80"
                y="96"
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontWeight="600"
                fontFamily="Inter, sans-serif"
                letterSpacing="1.2"
              >
                TOTAL
              </text>
            </svg>
            <ul className="donut-legend">
              {riskLevels.map((level) => {
                const count = report.riskCounts[level]
                const pct = report.total > 0 ? Math.round((count / report.total) * 100) : 0
                return (
                  <li key={level} className={`donut-legend__row donut-legend__row--${level}`}>
                    <span className="donut-legend__dot" />
                    <span className="donut-legend__label">{level}</span>
                    <span className="donut-legend__count">{count}</span>
                    <span className="donut-legend__pct">{pct}%</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="reports-panel">
          <div className="reports-panel__head">
            <h3 className="reports-panel__title">Document types</h3>
            <p className="reports-panel__sub">Most analyzed categories</p>
          </div>
          {docEntries.length === 0 ? (
            <p className="admin-subtitle">No type breakdown.</p>
          ) : (
            <ul className="doc-bars">
              {docEntries.map(([type, count]) => {
                const pct = maxDocCount > 0 ? (count / maxDocCount) * 100 : 0
                return (
                  <li key={type} className="doc-bar">
                    <div className="doc-bar__head">
                      <span className="doc-bar__name">{formatDocTypeUi(type)}</span>
                      <span className="doc-bar__count">{count}</span>
                    </div>
                    <div className="doc-bar__track">
                      <span className="doc-bar__fill" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <p className="history-footnote">
        Figures update when you finish new analyses — data is stored in{' '}
        <code style={{ fontSize: '0.82em' }}>users/&lt;uid&gt;/analyses</code>.
      </p>
    </div>
  )
}

function SettingsTab({
  theme,
  onToggleTheme,
}: {
  theme: Theme
  onToggleTheme: () => void
}) {
  return (
    <div className="settings-tab">
      <div className="settings-card">
        {/* Appearance */}
        <div className="settings-row">
          <div className="settings-row__info">
            <p className="settings-row__label">Appearance</p>
            <p className="settings-row__sub">Choose your preferred color theme</p>
          </div>
          <div className="theme-pill-switcher">
            <button
              className={`theme-pill${theme === 'light' ? ' theme-pill--active' : ''}`}
              onClick={() => theme !== 'light' && onToggleTheme()}
            >
              <Sun size={13} />
              Light
            </button>
            <button
              className={`theme-pill${theme === 'dark' ? ' theme-pill--active' : ''}`}
              onClick={() => theme !== 'dark' && onToggleTheme()}
            >
              <Moon size={13} />
              Dark
            </button>
          </div>
        </div>

        <div className="settings-divider" />

        {/* API Endpoint */}
        <div className="settings-row">
          <div className="settings-row__info">
            <p className="settings-row__label">API Endpoint</p>
            <p className="settings-row__sub">Backend analysis server</p>
          </div>
          <code className="settings-endpoint">
            {import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'}
          </code>
        </div>

        <div className="settings-divider" />

        {/* About */}
        <div className="settings-row">
          <div className="settings-row__info">
            <p className="settings-row__label">About DocRisk</p>
            <p className="settings-row__sub">
              AI-powered fraud detection for Sri Lankan documents. Analyzes job offers,
              land deeds, visas, and more using Gemini 2.5 Flash.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
