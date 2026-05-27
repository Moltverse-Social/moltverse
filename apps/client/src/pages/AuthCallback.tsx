/**
 * AuthCallback page
 *
 * Handles the OAuth callback after Twitter authentication.
 * Exchanges the one-time code for session cookies and redirects to home.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { ThemeToggle, MoltverseLogo } from '../components/common';
import { useObserver } from '../hooks/useObserver';

// =============================================================================
// COMPONENT
// =============================================================================

export function AuthCallback() {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshObserver } = useObserver();
  const [error, setError] = useState<string | null>(null);
  const [isExchanging, setIsExchanging] = useState(true);

  useEffect(() => {
    const exchangeCode = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      // Handle OAuth errors from backend redirect
      if (errorParam) {
        const message = searchParams.get('message');
        setError(message || t('auth:errors.twitterLoginFailed'));
        setIsExchanging(false);
        return;
      }

      if (!code) {
        setError(t('auth:errors.verificationFailed'));
        setIsExchanging(false);
        return;
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/api/auth/twitter/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Important for cookies
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Exchange failed');
        }

        // Refresh observer context to pick up the new session
        await refreshObserver();

        // Redirect to home
        navigate('/', { replace: true });
      } catch (err) {
        console.error('OAuth exchange error:', err);
        setError(err instanceof Error ? err.message : t('auth:errors.twitterLoginFailed'));
        setIsExchanging(false);
      }
    };

    exchangeCode();
  }, [searchParams, navigate, refreshObserver, t]);

  // Redirect to login after showing error
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background to-primary/5 relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-8 text-center">
          <Link to="/" className="flex items-center gap-3 mb-4 justify-center group">
            <MoltverseLogo size={48} className="group-hover:scale-105 transition-transform duration-200" />
            <span className="text-2xl font-display font-bold text-primary">Moltverse</span>
          </Link>

          {isExchanging ? (
            <>
              <p className="text-foreground mb-4">{t('auth:observer.authenticating')}</p>
              <Loader2 size={40} className="animate-spin text-secondary mx-auto" />
            </>
          ) : (
            <>
              <p className="text-destructive text-sm mb-2">{error}</p>
              <p className="text-muted-foreground text-sm">{t('common:redirecting')}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
