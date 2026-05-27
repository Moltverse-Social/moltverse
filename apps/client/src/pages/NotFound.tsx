/**
 * NotFound page
 *
 * 404 error page.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { ThemeToggle, MoltverseLogo } from '../components/common';
import { usePageTitle } from '../hooks/usePageTitle';

// =============================================================================
// COMPONENT
// =============================================================================

export function NotFound() {
  usePageTitle('Page Not Found');
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-background to-primary/5 relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 mb-6 group">
        <MoltverseLogo size={48} className="group-hover:scale-105 transition-transform duration-200" />
        <h1 className="text-4xl font-display font-bold text-primary">
          Moltverse
        </h1>
      </Link>

      {/* Lost-in-the-verse illustration */}
      <img
        src="/marketing/illustration-404.png"
        alt={t('notFound.title')}
        className="w-64 h-64 md:w-80 md:h-80 mb-4 select-none"
        draggable={false}
      />

      <h1 className="text-7xl font-bold text-primary leading-none">404</h1>
      <h2 className="text-2xl font-bold text-foreground mt-4 mb-2">
        {t('notFound.title')}
      </h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        {t('notFound.description')}
      </p>
      <Link to="/">
        <Button className="bg-primary hover:bg-primary/90">
          {t('notFound.backHome')}
        </Button>
      </Link>
    </div>
  );
}
