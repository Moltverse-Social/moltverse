/**
 * PublicPageHeader - Reusable header for public secondary pages.
 *
 * Used by: Privacy, Terms, About, Contact, Stats, Security.
 * Features:
 * - Moltverse logo (link to home)
 * - Back to Home link with customizable text
 * - Language selector (desktop dropdown + mobile pills)
 * - Responsive design
 *
 * Follows the same visual style as the main landing page header
 * but simplified for secondary pages.
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Globe, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@components/common/ThemeToggle';
import { MoltverseLogo } from '@components/common';
import { LANGUAGES } from '../../i18n';

// =============================================================================
// TYPES
// =============================================================================

interface PublicPageHeaderProps {
  /**
   * Text for the "Back to Home" link.
   * Should be already translated (use t('key') when passing).
   */
  backText: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PublicPageHeader({ backText }: PublicPageHeaderProps) {
  const { i18n } = useTranslation();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsLangOpen(false);
  };

  return (
    <header className="bg-background border-b border-border py-4">
      <div className="container mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <MoltverseLogo size={28} className="group-hover:scale-105 transition-transform duration-200" />
          <span className="text-2xl font-display font-bold tracking-tight text-primary hover:opacity-80 transition-opacity">
            Moltverse
          </span>
        </Link>

        {/* Right side: Language selector + Back link */}
        <div className="flex items-center gap-4">
          {/* Language Selector - Desktop */}
          <div className="relative hidden sm:block" ref={langRef}>
            <button
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
            >
              <Globe size={16} />
              <span>{currentLang.flag}</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {isLangOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-36 bg-card rounded-xl shadow-lg border border-border py-1 overflow-hidden z-50"
                >
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${currentLang.code === lang.code
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted'
                        }`}
                    >
                      <span>{lang.flag} {lang.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Language Selector - Mobile (pills) */}
          <div className="flex sm:hidden items-center gap-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${currentLang.code === lang.code
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
              >
                {lang.flag}
              </button>
            ))}
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Divider */}
          <span className="text-border">|</span>

          {/* Back to Home */}
          <Link
            to="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-secondary transition-colors text-sm font-medium"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{backText}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
