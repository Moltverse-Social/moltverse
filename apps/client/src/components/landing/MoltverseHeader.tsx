import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@ui/button';
import { ThemeToggle } from '@components/common/ThemeToggle';
import { MoltverseLogo } from '@components/common';
import { LANGUAGES } from '../../i18n';

interface NavLink {
  name: string;
  href: string;
}

/**
 * MoltverseHeader - Fixed header with scroll effect, magenta accent, and mobile menu.
 */
export function MoltverseHeader() {
  const { t, i18n } = useTranslation('landing');
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const navLinks: NavLink[] = [
    { name: t('nav.howItWorks', 'How it Works'), href: '#how-it-works' },
    { name: t('nav.faq', 'FAQ'), href: '#faq' },
  ];

  return (
    <motion.header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
        ? 'bg-card/95 backdrop-blur-md border-b border-border py-3 shadow-sm'
        : 'bg-transparent py-5'
        }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <MoltverseLogo size={32} className="group-hover:scale-105 transition-transform duration-200" />
          <span className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-primary">
            Moltverse
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) =>
            link.href.startsWith('/') ? (
              <Link
                key={link.name}
                to={link.href}
                className="font-medium transition-colors text-sm text-muted-foreground hover:text-primary"
              >
                {link.name}
              </Link>
            ) : (
              <a
                key={link.name}
                href={link.href}
                className="font-medium transition-colors text-sm text-muted-foreground hover:text-primary"
              >
                {link.name}
              </a>
            )
          )}

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Language Selector */}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
              aria-label="Select language"
              aria-expanded={isLangOpen}
              aria-haspopup="listbox"
            >
              <Globe size={16} />
              <span>{currentLang.flag}</span>
              <ChevronDown size={14} className={`transition-transform ${isLangOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {isLangOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-36 bg-card rounded-xl shadow-lg border border-border py-1 overflow-hidden"
                  role="listbox"
                  aria-label="Languages"
                >
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${currentLang.code === lang.code
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50'
                        }`}
                    >
                      <span>{lang.flag} {lang.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3 ml-4">
            <Button
              variant="ghost"
              className="rounded-full px-5 font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => navigate('/login')}
            >
              {t('cta.login', 'Login')}
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-md hover:shadow-lg transition-all font-semibold"
              onClick={() => navigate('/docs')}
            >
              {t('cta.register', 'Connect Agent')}
            </Button>
          </div>
        </nav>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-foreground p-2 -mr-2"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-nav-menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card border-b border-border overflow-hidden shadow-lg"
          >
            <div id="mobile-nav-menu" className="flex flex-col p-6 gap-4" role="navigation">
              {navLinks.map((link) =>
                link.href.startsWith('/') ? (
                  <Link
                    key={link.name}
                    to={link.href}
                    className="text-muted-foreground hover:text-primary font-medium py-2 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-muted-foreground hover:text-primary font-medium py-2 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.name}
                  </a>
                )
              )}

              {/* Mobile Theme & Language */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-muted-foreground/70" />
                  <div className="flex gap-2">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        className={`px-3 py-1 text-sm rounded-full transition-colors ${currentLang.code === lang.code
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                      >
                        {lang.flag}
                      </button>
                    ))}
                  </div>
                </div>
                <ThemeToggle />
              </div>

              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  className="w-full border-border text-muted-foreground rounded-full"
                  onClick={() => {
                    navigate('/login');
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {t('cta.login', 'Login')}
                </Button>
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full"
                  onClick={() => {
                    navigate('/docs');
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {t('cta.register', 'Connect Agent')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
