/**
 * ── Pluggable i18n Framework ──────────────────────────────
 * Language packs are auto-discovered from this directory.
 * To add a new language:
 *   1. Copy en.json to <code>.json (e.g., de.json for German)
 *   2. Update __meta__: code, name, nativeName, dir
 *   3. Translate all string values (leave keys unchanged)
 *   4. Done — no code changes needed.
 *      Vite's import.meta.glob picks up the new file automatically.
 * ────────────────────────────────────────────────────────
 */

// Auto-discover all .json files in this directory using Vite glob
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const langModules = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, any>

export interface LanguagePack {
  code: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
}

interface LanguageMeta {
  __meta__: LanguagePack
  [key: string]: unknown
}

// Registry of all loaded language packs
const registry: Record<string, Record<string, string>> = {}

for (const [path, module] of Object.entries(langModules)) {
  const code = path.match(/\/(\w+)\.json$/)?.[1]
  if (code && code !== 'index') {
    registry[code] = module as Record<string, string>
  }
}

export function getAvailableLanguages(): LanguagePack[] {
  return Object.values(registry)
    .filter(pack => (pack as unknown as LanguageMeta).__meta__)
    .map(pack => (pack as unknown as LanguageMeta).__meta__)
}

export function getTranslation(langCode: string): Record<string, string> {
  const pack = registry[langCode]
  if (!pack) return registry['en'] ?? {} // fallback to English
  // Return all keys except __meta__
  return Object.fromEntries(
    Object.entries(pack).filter(([key]) => key !== '__meta__')
  )
}

export function translate(key: string, langCode: string): string {
  const translations = getTranslation(langCode)
  return translations[key] ?? getTranslation('en')[key] ?? key
}

// Auto-detect browser language
export function detectBrowserLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  const browserLang = navigator.language?.split('-')[0] ?? 'en'
  const available = getAvailableLanguages().map(l => l.code)
  return available.includes(browserLang) ? browserLang : 'en'
}


