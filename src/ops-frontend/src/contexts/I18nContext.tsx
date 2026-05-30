import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import en from '../i18n/en.json'
import fr from '../i18n/fr.json'

const translations: Record<string, Record<string, string>> = { en, fr }

type Lang = 'en' | 'fr'

interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || 'en'
  })

  const t = useCallback((key: string): string => {
    const dict = translations[lang]
    return dict?.[key] ?? key
  }, [lang])

  const handleSetLang = useCallback((newLang: Lang) => {
    setLang(newLang)
    localStorage.setItem('lang', newLang)
  }, [])

  return (
    <I18nContext.Provider value={{ lang, setLang: handleSetLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
