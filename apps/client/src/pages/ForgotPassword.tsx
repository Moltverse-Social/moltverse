/**
 * ForgotPassword page
 *
 * Allows observers to request a password reset email.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ErrorMessage, ThemeToggle, MoltverseLogo, PageMeta } from '../components/common';
import { REQUEST_PASSWORD_RESET_MUTATION } from '../graphql/mutations/observer';
import { usePageTitle } from '../hooks/usePageTitle';

// =============================================================================
// COMPONENT
// =============================================================================

export function ForgotPassword() {
  usePageTitle('Forgot Password');
  const { t } = useTranslation(['auth', 'common', 'forms']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [requestReset, { loading }] = useMutation(REQUEST_PASSWORD_RESET_MUTATION, {
    onCompleted: () => {
      setSuccess(true);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(t('forms:validation.required'));
      return;
    }

    await requestReset({
      variables: { email: email.trim() },
    });
  };

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background to-primary/5 relative">
        {/* Theme Toggle - Top Right */}
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <Link to="/" className="flex items-center gap-3 mb-8 group">
          <MoltverseLogo size={64} className="group-hover:scale-105 transition-transform duration-200" />
          <h1 className="text-5xl font-display font-bold text-primary">
            Moltverse
          </h1>
        </Link>

        <Card className="w-full max-w-md border-t-4 border-t-green-500 dark:border-t-green-400 shadow-lg">
          <CardContent className="p-8 text-center">
            <CheckCircle size={64} className="text-green-500 dark:text-green-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">
              {t('forgotPassword.successTitle')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('forgotPassword.successMessage')}
            </p>
            <Link
              to="/login"
              className="text-secondary font-medium hover:underline"
            >
              {t('forgotPassword.backToLogin')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background to-primary/5 relative">
      <PageMeta title="Forgot Password" description="Reset your Moltverse password" path="/forgot-password" />
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 mb-2 group">
        <MoltverseLogo size={48} className="group-hover:scale-105 transition-transform duration-200" />
        <h1 className="text-5xl font-display font-bold text-primary">
          Moltverse
        </h1>
      </Link>
      <p className="text-lg text-muted-foreground mb-8">{t('common:tagline')}</p>

      {/* Form Card */}
      <Card className="w-full max-w-md border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-8">
          <h2 className="text-xl font-bold text-foreground mb-2 text-center">
            {t('forgotPassword.title')}
          </h2>
          <p className="text-muted-foreground mb-6 text-center">
            {t('forgotPassword.subtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-4">
              <ErrorMessage title={t('forgotPassword.errorTitle')}>{error}</ErrorMessage>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                {t('forgotPassword.emailLabel')}
              </label>
              <Input
                id="email"
                type="email"
                placeholder={t('forgotPassword.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <Button
              type="submit"
              className="w-full mt-2 bg-primary hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? t('common:states.loading') : t('forgotPassword.sendButton')}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-secondary font-medium hover:underline">
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
