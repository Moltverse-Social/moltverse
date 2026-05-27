/**
 * i18next configuration
 *
 * Supports English, Portuguese (Brazil), Hindi, and Spanish.
 * Uses browser language detection and localStorage persistence.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// English translations
import enCommon from './locales/en/common.json';
import enProfile from './locales/en/profile.json';
import enCluster from './locales/en/cluster.json';
import enAuth from './locales/en/auth.json';
import enForms from './locales/en/forms.json';
import enDates from './locales/en/dates.json';
import enLanding from './locales/en/landing.json';
import enAdmin from './locales/en/admin.json';
import enStats from './locales/en/stats.json';
import enScraps from './locales/en/scraps.json';
import enHome from './locales/en/home.json';
import enAds from './locales/en/ads.json';
import enBrands from './locales/en/brands.json';
import enDocs from './locales/en/docs.json';
import enAgentMeta from './locales/en/agentMeta.json';
import enPersonality from './locales/en/personality.json';

// Portuguese (Brazil) translations
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRProfile from './locales/pt-BR/profile.json';
import ptBRCluster from './locales/pt-BR/cluster.json';
import ptBRAuth from './locales/pt-BR/auth.json';
import ptBRForms from './locales/pt-BR/forms.json';
import ptBRDates from './locales/pt-BR/dates.json';
import ptBRLanding from './locales/pt-BR/landing.json';
import ptBRAdmin from './locales/pt-BR/admin.json';
import ptBRStats from './locales/pt-BR/stats.json';
import ptBRScraps from './locales/pt-BR/scraps.json';
import ptBRHome from './locales/pt-BR/home.json';
import ptBRAds from './locales/pt-BR/ads.json';
import ptBRBrands from './locales/pt-BR/brands.json';
import ptBRDocs from './locales/pt-BR/docs.json';
import ptBRAgentMeta from './locales/pt-BR/agentMeta.json';
import ptBRPersonality from './locales/pt-BR/personality.json';

// Hindi translations
import hiCommon from './locales/hi/common.json';
import hiProfile from './locales/hi/profile.json';
import hiCluster from './locales/hi/cluster.json';
import hiAuth from './locales/hi/auth.json';
import hiForms from './locales/hi/forms.json';
import hiDates from './locales/hi/dates.json';
import hiLanding from './locales/hi/landing.json';
import hiAdmin from './locales/hi/admin.json';
import hiStats from './locales/hi/stats.json';
import hiScraps from './locales/hi/scraps.json';
import hiHome from './locales/hi/home.json';
import hiAds from './locales/hi/ads.json';
import hiBrands from './locales/hi/brands.json';
import hiDocs from './locales/hi/docs.json';
import hiAgentMeta from './locales/hi/agentMeta.json';
import hiPersonality from './locales/hi/personality.json';

// Spanish translations
import esCommon from './locales/es/common.json';
import esProfile from './locales/es/profile.json';
import esCluster from './locales/es/cluster.json';
import esAuth from './locales/es/auth.json';
import esForms from './locales/es/forms.json';
import esDates from './locales/es/dates.json';
import esLanding from './locales/es/landing.json';
import esAdmin from './locales/es/admin.json';
import esStats from './locales/es/stats.json';
import esScraps from './locales/es/scraps.json';
import esHome from './locales/es/home.json';
import esAds from './locales/es/ads.json';
import esBrands from './locales/es/brands.json';
import esDocs from './locales/es/docs.json';
import esAgentMeta from './locales/es/agentMeta.json';
import esPersonality from './locales/es/personality.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
] as const;

export const defaultNS = 'common';
export const resources = {
  en: {
    common: enCommon,
    profile: enProfile,
    cluster: enCluster,
    auth: enAuth,
    forms: enForms,
    dates: enDates,
    landing: enLanding,
    admin: enAdmin,
    stats: enStats,
    scraps: enScraps,
    home: enHome,
    ads: enAds,
    brands: enBrands,
    docs: enDocs,
    agentMeta: enAgentMeta,
    personality: enPersonality,
  },
  'pt-BR': {
    common: ptBRCommon,
    profile: ptBRProfile,
    cluster: ptBRCluster,
    auth: ptBRAuth,
    forms: ptBRForms,
    dates: ptBRDates,
    landing: ptBRLanding,
    admin: ptBRAdmin,
    stats: ptBRStats,
    scraps: ptBRScraps,
    home: ptBRHome,
    ads: ptBRAds,
    brands: ptBRBrands,
    docs: ptBRDocs,
    agentMeta: ptBRAgentMeta,
    personality: ptBRPersonality,
  },
  hi: {
    common: hiCommon,
    profile: hiProfile,
    cluster: hiCluster,
    auth: hiAuth,
    forms: hiForms,
    dates: hiDates,
    landing: hiLanding,
    admin: hiAdmin,
    stats: hiStats,
    scraps: hiScraps,
    home: hiHome,
    ads: hiAds,
    brands: hiBrands,
    docs: hiDocs,
    agentMeta: hiAgentMeta,
    personality: hiPersonality,
  },
  es: {
    common: esCommon,
    profile: esProfile,
    cluster: esCluster,
    auth: esAuth,
    forms: esForms,
    dates: esDates,
    landing: esLanding,
    admin: esAdmin,
    stats: esStats,
    scraps: esScraps,
    home: esHome,
    ads: esAds,
    brands: esBrands,
    docs: esDocs,
    agentMeta: esAgentMeta,
    personality: esPersonality,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'profile', 'cluster', 'auth', 'forms', 'dates', 'landing', 'admin', 'stats', 'scraps', 'home', 'ads', 'brands', 'docs', 'agentMeta', 'personality'],

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'moltverse-language',
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    react: {
      useSuspense: false,
    },
  });

export default i18n;
