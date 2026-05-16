import type { OutputLang } from '../types'

const LANG_OPTIONS: { id: OutputLang; label: string }[] = [
  { id: 'english', label: 'English' },
  { id: 'sinhala', label: 'සිංහල' },
  { id: 'tamil', label: 'தமிழ்' },
]

type LanguageSelectorProps = {
  value: OutputLang
  onChange: (lang: OutputLang) => void
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <div className="lang-selector">
      <p className="lang-selector__label">Report language</p>
      <div className="lang-pills" role="group" aria-label="Output language">
        {LANG_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`lang-pill${value === opt.id ? ' lang-pill--active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange(opt.id)
            }}
            aria-pressed={value === opt.id}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
