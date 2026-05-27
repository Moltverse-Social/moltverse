/**
 * ResetPassword page
 *
 * Allows observers to reset their password using a token from email.
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ErrorMessage, ThemeToggle, MoltverseLogo, PasswordInput, PageMeta } from '../components/common';
import { RESET_PASSWORD_MUTATION } from '../graphql/mutations/observer';
import { usePageTitle } from '../hooks/usePageTitle';

// =============================================================================
// COMPONENT
// =============================================================================

export function ResetPassword() {
  usePageTitle('Reset Password');
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation(['auth', 'common', 'forms']);
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  // Validate token format (should be 64 hex chars)
  useEffect(() => {
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      setInvalidToken(true);
    }
  }, [token]);

  const [resetPassword, { loading }] = useMutation(RESET_PASSWORD_MUTATION, {
    onCompleted: () => {
      setSuccess(true);
      setError(null);
    },
    onError: (err) => {
      // Check if it's a token error
      if (err.message.includes('Invalid') || err.message.includes('expired')) {
        setInvalidToken(true);
      } else {
        setError(err.message);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate password length
    if (password.length < 8) {
      setError(t('claim.passwordMinLength'));
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError(t('claim.passwordMismatch'));
      return;
    }

    // Validate password requirements (1 uppercase, 1 lowercase, 1 number, 1 special char)
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      setError(t('claim.passwordRequirements'));
      return;
    }

    await resetPassword({
      variables: {
        input: {
          token,
          password,
        },
      },
    });
  };

  // Invalid token state
  if (invalidToken) {
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

        <Card className="w-full max-w-md border-t-4 border-t-destructive shadow-lg">
          <CardContent className="p-8 text-center">
            <XCircle size={64} className="text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-bold text-destructive mb-2">
              {t('resetPassword.errorTitle')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('resetPassword.invalidToken')}
            </p>
            <Link
              to="/forgot-password"
              className="text-secondary font-medium hover:underline"
            >
              {t('forgotPassword.title')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              {t('resetPassword.successTitle')}
            </h3>
            <p className="text-muted-foreground mb-6">
              {t('resetPassword.successMessage')}
            </p>
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => navigate('/login')}
            >
              {t('resetPassword.goToLogin')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background to-primary/5 relative">
      <PageMeta title="Reset Password" description="Create a new password" path="/reset-password" />
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
            {t('resetPassword.title')}
          </h2>
          <p className="text-muted-foreground mb-6 text-center">
            {t('resetPassword.subtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-4">
              <ErrorMessage title={t('resetPassword.errorTitle')}>{error}</ErrorMessage>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                {t('resetPassword.passwordLabel')}
              </label>
              <PasswordInput
                id="password"
                placeholder={t('forms:placeholders.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                {t('resetPassword.confirmPasswordLabel')}
              </label>
              <PasswordInput
                id="confirmPassword"
                placeholder={t('claim.confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <p className="text-xs text-muted-foreground mt-1">{t('claim.passwordHint')}</p>

            <Button
              type="submit"
              className="w-full mt-2 bg-primary hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? t('common:states.loading') : t('resetPassword.resetButton')}
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
