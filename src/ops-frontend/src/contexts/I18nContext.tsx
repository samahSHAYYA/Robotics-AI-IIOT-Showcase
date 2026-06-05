import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { getAvailableLanguages, detectBrowserLanguage, translate as coreTranslate } from '../i18n'
import type { LanguagePack } from '../i18n'

interface I18nContextType {
  lang: string
  availableLanguages: LanguagePack[]
  setLang: (lang: string) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(() => {
    return localStorage.getItem('sf_lang') || detectBrowserLanguage()
  })
  const [availableLanguages] = useState<LanguagePack[]>(() => getAvailableLanguages())

  const t = useCallback((key: string): string => {
    return coreTranslate(key, lang)
  }, [lang])

  const setLang = useCallback((newLang: string) => {
    setLangState(newLang)
    localStorage.setItem('sf_lang', newLang)
  }, [])

  // Persist lang attribute on <html> for potential CSS dir support
  useEffect(() => {
    const pack = availableLanguages.find(l => l.code === lang)
    if (pack) {
      document.documentElement.setAttribute('lang', pack.code)
      document.documentElement.setAttribute('dir', pack.dir)
    }
  }, [lang, availableLanguages])

  return (
    <I18nContext.Provider value={{ lang, availableLanguages, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
