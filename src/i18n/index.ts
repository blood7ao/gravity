import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Language, TranslationSchema } from './types';
import { en } from './locales/en';
import { zh } from './locales/zh';

const dictionaries: Record<Language, TranslationSchema> = {
  en,
  zh,
};

const LANGUAGE_STORAGE_KEY = 'gravity_language';
const LEGACY_LANGUAGE_STORAGE_KEY = 'antigravity_language';

function getInitialLanguage(): Language {
  try {
    const saved =
      localStorage.getItem(LANGUAGE_STORAGE_KEY) || localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') {
      return saved;
    }
    // Check browser/system language
    if (typeof navigator !== 'undefined' && navigator.language) {
      if (navigator.language.toLowerCase().startsWith('zh')) {
        return 'zh';
      }
    }
  } catch (e) {
    console.warn('Failed to read saved language:', e);
  }
  // Default to zh if in Chinese locale, or zh as primary requested
  return 'zh';
}

interface I18nState {
  language: Language;
  t: TranslationSchema;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

export const useI18n = create<I18nState>((set, get) => {
  const initialLang = getInitialLanguage();

  return {
    language: initialLang,
    t: dictionaries[initialLang],
    setLanguage: (lang: Language) => {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
        invoke('set_setting', { key: 'language', value: lang }).catch(() => {});
      } catch (e) {
        console.warn('Failed to save language preference:', e);
      }
      set({
        language: lang,
        t: dictionaries[lang],
      });
    },
    toggleLanguage: () => {
      const next = get().language === 'zh' ? 'en' : 'zh';
      get().setLanguage(next);
    },
  };
});

// Async sync with database settings if present
if (typeof window !== 'undefined') {
  invoke<string | null>('get_setting', { key: 'language' })
    .then((dbLang) => {
      if (dbLang === 'zh' || dbLang === 'en') {
        const current = useI18n.getState().language;
        if (current !== dbLang) {
          useI18n.getState().setLanguage(dbLang);
        }
      }
    })
    .catch(() => {});
}

export * from './types';
