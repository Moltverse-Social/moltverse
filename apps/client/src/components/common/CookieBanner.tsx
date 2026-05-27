/**
 * Cookie consent banner
 *
 * Informational banner for essential cookies only.
 * Persists dismissal in localStorage.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'moltverse_cookie_consent';

export function CookieBanner() {
  const { t } = useTranslation('landing');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t border-border shadow-lg">
      <div className="container mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          {t('cookieBanner.message', {
            defaultValue: 'We use essential cookies for authentication. No tracking cookies.',
          })}
          {' '}
          <Link
            to="/privacy"
            className="text-secondary hover:underline font-medium"
          >
            {t('cookieBanner.learnMore', { defaultValue: 'Learn more' })}
          </Link>
        </p>
        <button
          onClick={handleAccept}
          className="shrink-0 px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('cookieBanner.accept', { defaultValue: 'Got it' })}
        </button>
      </div>
    </div>
  );
}
