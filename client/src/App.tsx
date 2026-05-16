import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  LogOut,
  Mail,
  Menu,
  Moon,
  RotateCcw,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { auth, isFirebaseConfigured } from './lib/firebase'
import { ResultConfidence, ResultMetaBadges } from './components/ResultCard'
import AdminDashboard from './pages/AdminDashboard'
import { LanguageSelector } from './components/LanguageSelector'
import { Dashboard, type AnalysisCompletePayload } from './pages/Dashboard'
import { ScamCard } from './components/ScamCard'
import { ScamChatModal } from './components/ScamChatModal'
import { SCAMS, type ScamEntry } from './utils/scamData'
import { useUserAnalyses } from './hooks/useUserAnalyses'
import { summarizeAnalyses } from './lib/userAnalyses'
import type { AnalysisResult, OutputLang, RiskLevel } from './types'
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
function parseFlag(flag: string): { lead: string; detail: string | null } {
  const match = flag.match(/^(.+?)\s*\((.+)\)\s*$/)
  if (match) return { lead: match[1], detail: match[2] }
  return { lead: flag, detail: null }
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'var(--risk-low)'
    case 'medium': return 'var(--risk-medium)'
    case 'high': return 'var(--risk-high)'
    default: return 'var(--text-muted)'
  }
}

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

type Tab = 'analyze' | 'history' | 'reports' | 'settings'

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

  if (!user) return <AuthForm theme={theme} onToggleTheme={toggleTheme} />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminDashboard user={user} />} />
        <Route
          path="/*"
          element={<MainLayout user={user} theme={theme} onToggleTheme={toggleTheme} />}
        />
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
        />
        <main className="page">
          {activeTab === 'analyze' && <AnalyzeTab user={user} />}
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
function MobileMenu({
  open,
  activeTab,
  onTabChange,
  onLogout,
}: {
  open: boolean
  activeTab: Tab
  onTabChange: (t: Tab) => void
  onLogout: () => void
}) {
  return (
    <div className={`mobile-menu${open ? ' mobile-menu--open' : ''}`}>
      {MAIN_NAV_TABS.map((tab) => (
        <button
          key={tab.id}
          className={`mobile-menu-item${activeTab === tab.id ? ' mobile-menu-item--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button
        type="button"
        className={`mobile-menu-item${activeTab === 'settings' ? ' mobile-menu-item--active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        Settings
      </button>
      <button className="mobile-menu-item mobile-menu-item--danger" onClick={onLogout}>
        Log out
      </button>
    </div>
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
              <div>
                <h2 className="scam-alert-header__title">Trending Scams in Sri Lanka</h2>
                <p className="scam-alert-header__sub">Current active fraud schemes — click any card to learn more and chat with an AI expert</p>
              </div>
            </div>
            <div className="scam-alert-grid">
              {SCAMS.map((scam, i) => (
                <ScamCard
                  key={scam.id}
                  scam={scam}
                  onReadMore={setSelectedScam}
                  index={i}
                />
              ))}
            </div>
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
// Half-Circle Gauge
// ══════════════════════════════════════════════════════════════════════════════
function HalfCircleGauge({ score, level }: { score: number; level: RiskLevel }) {
  const R = 80
  const CX = 100
  const CY = 100
  const clamped = Math.min(100, Math.max(0, score))

  // angle: 0 score → π (left), 100 score → 0 (right)
  const angle = Math.PI * (1 - clamped / 100)
  const ex = CX + R * Math.cos(angle)
  const ey = CY - R * Math.sin(angle)
  const largeArc = clamped > 50 ? 1 : 0

  const fillPath =
    clamped === 0
      ? ''
      : `M ${CX - R} ${CY} A ${R} ${R} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`

  const riskColor =
    level === 'low' ? '#34d399' : level === 'medium' ? '#fbbf24' : '#ef4444'

  // Pointer rotates from -180° (score=0) to 0° (score=100)
  const pointerDeg = -180 + clamped * 1.8

  return (
    <div className="gauge-wrap">
      <svg
        viewBox="0 0 200 110"
        className="gauge-svg"
        aria-label={`Risk score ${score} out of 100`}
      >
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.2"
        />

        {/* Fill arc */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={riskColor}
            strokeWidth="10"
            strokeLinecap="round"
            filter="url(#gauge-glow)"
          />
        )}

        {/* Pointer arrow */}
        <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `rotate(${pointerDeg}deg)` }}>
          <polygon
            points={`${CX + R - 16},${CY} ${CX + R + 2},${CY - 5} ${CX + R + 2},${CY + 5}`}
            fill={riskColor}
          />
        </g>

        {/* Score text */}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          fill={riskColor}
          fontSize="28"
          fontWeight="800"
          fontFamily="Inter, sans-serif"
        >
          {(score / 10).toFixed(1)}
        </text>
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="11"
          fontWeight="500"
          fontFamily="Inter, sans-serif"
        >
          / 10
        </text>
      </svg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Result Dashboard
// ══════════════════════════════════════════════════════════════════════════════
function ResultDashboard({
  result,
  file,
  previewUrl,
  outputLang,
  onReset,
}: {
  result: AnalysisResult
  file: File
  previewUrl: string | null
  outputLang: OutputLang
  onReset: () => void
}) {
  const [explanationOpen, setExplanationOpen] = useState(false)
  const riskColor = getRiskColor(result.risk_level)
  const isMediumPlus = result.risk_level !== 'low'
  const isHigh = result.risk_level === 'high'

  const pillClass =
    result.risk_level === 'low'
      ? 'risk-pill risk-pill--low'
      : result.risk_level === 'medium'
        ? 'risk-pill risk-pill--medium'
        : 'risk-pill risk-pill--high'

  return (
    <div className="result-dashboard">
      {/* ── Left column ── */}
      <div className="result-col result-col--left">
        {/* Doc Card */}
        <div className="result-card doc-card" style={{ '--delay': '0ms' } as React.CSSProperties}>
          <div className="doc-card-header">
            <div>
              <h2 className="doc-card-title">Document Risk Analysis</h2>
              <p className="doc-card-filename">{file.name}</p>
              <p className="doc-card-risk" style={{ color: riskColor }}>
                {result.risk_level} risk
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onReset}>
              <RotateCcw size={14} />
              Analyze
            </button>
          </div>

          {/* Gauge + Preview */}
          <div className="gauge-preview-row">
            <HalfCircleGauge score={result.risk_score} level={result.risk_level} />
            <div className="doc-preview">
              {file.type.startsWith('image/') && previewUrl ? (
                <img src={previewUrl} alt="Document preview" />
              ) : (
                <FileText size={40} strokeWidth={1.25} />
              )}
            </div>
          </div>

          {/* Risk Summary Grid */}
          <div className="risk-summary-grid">
            <div className="risk-cell risk-cell--badges">
              <span className="risk-cell__label">Document Type</span>
              <ResultMetaBadges
                documentType={result.document_type}
                outputLang={outputLang}
              />
            </div>
            <div className="risk-cell">
              <span className="risk-cell__label">Risk Level</span>
              <span className={pillClass}>{result.risk_level}</span>
            </div>
            <div className="risk-cell">
              <span className="risk-cell__label">Risk Score</span>
              <span
                className="risk-cell__value risk-cell__value--score"
                style={{ color: riskColor }}
              >
                {(result.risk_score / 10).toFixed(1)}{' '}
                <span className="risk-cell__unit">/ 10</span>
              </span>
            </div>
            <div className="risk-cell">
              <span className="risk-cell__label">Summary</span>
              <span className="risk-cell__value risk-cell__value--clamp">{result.summary}</span>
            </div>
          </div>

          <ResultConfidence result={result} />

          {/* Red Flags */}
          {result.red_flags.length > 0 && (
            <div className="red-flags">
              <h3 className="section-label">Key Red Flags</h3>
              <ul className="flag-list">
                {result.red_flags.map((flag, i) => {
                  const { lead, detail } = parseFlag(flag)
                  return (
                    <li
                      key={`flag-${i}`}
                      className="flag-item"
                      style={{
                        borderLeftColor: riskColor,
                        animationDelay: `${i * 70}ms`,
                      }}
                    >
                      <AlertTriangle size={15} style={{ color: riskColor }} />
                      <span>
                        <strong>{lead}</strong>
                        {detail && <span className="flag-detail"> ({detail})</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Explanation Accordion */}
        <div
          className="result-card"
          style={{ '--delay': '80ms' } as React.CSSProperties}
        >
          <button
            className="explanation-toggle"
            onClick={() => setExplanationOpen((o) => !o)}
            aria-expanded={explanationOpen}
          >
            <span>Detailed Explanation</span>
            {explanationOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {explanationOpen && (
            <div className="explanation-body">{result.explanation}</div>
          )}
        </div>

        <button className="btn btn-ghost" onClick={onReset}>
          <RotateCcw size={15} />
          Analyze another document
        </button>
      </div>

      {/* ── Right column ── */}
      <div className="result-col result-col--right">
        {/* Findings Card */}
        <div
          className="result-card findings-card"
          style={{ '--delay': '50ms' } as React.CSSProperties}
        >
          <div className="findings-header">
            <div className="findings-icon-tile">
              <ScanSearch size={17} />
            </div>
            <div>
              <h3 className="findings-title">Analysis Findings</h3>
              <p className="findings-sub">Explanation &amp; action</p>
            </div>
          </div>
          {result.red_flags.length > 0 ? (
            <ul className="findings-list">
              {result.red_flags.map((flag, i) => {
                const { lead } = parseFlag(flag)
                return (
                  <li key={`finding-${i}`} className="findings-item">
                    <span className="findings-bullet" style={{ background: riskColor }} />
                    <span>
                      <strong>{lead}</strong>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="findings-empty">No significant anomalies detected.</p>
          )}
        </div>

        {/* Action Card */}
        <div
          className={`result-card action-card${isMediumPlus ? ' action-card--danger' : ' action-card--safe'}`}
          style={{ '--delay': '110ms' } as React.CSSProperties}
        >
          <div className="action-header">
            {isMediumPlus ? (
              <AlertTriangle size={19} />
            ) : (
              <ShieldCheck size={19} />
            )}
            <h3 className="action-title">Recommended Action</h3>
          </div>
          <p className="action-body">{result.recommended_action}</p>
          <button
            className={`btn action-cta${isHigh ? ' btn-danger' : isMediumPlus ? ' btn-warning' : ' btn-safe'}`}
          >
            {isMediumPlus ? 'Flag for Manual Review' : 'Approve Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// History / Reports / Settings tabs
// ══════════════════════════════════════════════════════════════════════════════
function formatDocTypeUi(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function HistoryTab({ user }: { user: User }) {
  const { items, error, loading } = useUserAnalyses(user.uid)

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

  return (
    <div className="analyze-tab history-tab">
      <header className="history-header">
        <h2 className="history-title">Recent analyses</h2>
        <p className="history-sub">{rows.length} saved {rows.length === 1 ? 'result' : 'results'}</p>
      </header>
      <ul className="history-list">
        {rows.map((row) => (
          <li key={row.id} className="history-item preview-card">
            <div className="history-item__top">
              <div>
                <p className="preview-name">{row.fileName}</p>
                <p className="history-item__meta">
                  <Calendar size={13} aria-hidden />
                  {row.createdAt
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(row.createdAt)
                    : 'Date unknown'}
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                <span className="doc-type-badge">{formatDocTypeUi(row.document_type)}</span>
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
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Score {row.risk_score}
                </span>
              </div>
            </div>
            <p className="history-item__summary">{row.summary}</p>
          </li>
        ))}
      </ul>
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

  return (
    <div className="analyze-tab reports-tab">
      <header className="history-header">
        <h2 className="history-title">Your reports</h2>
        <p className="history-sub">Totals from analyses saved to your account ({report.total} total).</p>
      </header>

      <section className="admin-metrics" style={{ marginBottom: '1.25rem' }}>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">Total analyses</p>
          <p className="admin-metric-card__value">{report.total}</p>
        </article>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">Avg risk score</p>
          <p className="admin-metric-card__value">{report.avgRisk}</p>
          <p className="admin-metric-card__hint">0–100</p>
        </article>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">Avg confidence</p>
          <p className="admin-metric-card__value">{report.avgConfidence}</p>
          <p className="admin-metric-card__hint">Model certainty</p>
        </article>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">High-risk share</p>
          <p className="admin-metric-card__value">{report.highPct}%</p>
          <p className="admin-metric-card__hint">{report.riskCounts.high} flagged high</p>
        </article>
      </section>

      <section className="admin-panel">
        <h3 className="admin-panel__title">Risk distribution</h3>
        <div className="admin-chart">
          {riskLevels.map((level) => {
            const count = report.riskCounts[level]
            const pct = report.total > 0 ? (count / report.total) * 100 : 0
            return (
              <div key={level} className="admin-chart__row">
                <span className="admin-chart__label">{level}</span>
                <div className="admin-chart__track">
                  <span
                    className={`admin-chart__fill admin-chart__fill--${level}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="admin-chart__count">{count}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="admin-panel">
        <h3 className="admin-panel__title">Document types</h3>
        {docEntries.length === 0 ? (
          <p className="admin-subtitle">No type breakdown.</p>
        ) : (
          <ul className="admin-doc-list">
            {docEntries.map(([type, count]) => (
              <li key={type} className="admin-doc-item">
                <span className="admin-doc-item__name">{formatDocTypeUi(type)}</span>
                <span className="admin-doc-item__count">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
