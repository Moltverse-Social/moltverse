/**
 * VerifyEmail page
 *
 * Shows an 8-digit code input for email verification.
 * Displayed after account setup or when email is not verified.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ErrorMessage, ThemeToggle, MoltverseLogo, PageMeta } from '../components/common';
import { VERIFY_EMAIL_MUTATION, SEND_EMAIL_VERIFICATION_MUTATION } from '../graphql/mutations/observer';
import { useObserver } from '../hooks/useObserver';
import { usePageTitle } from '../hooks/usePageTitle';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================

const CODE_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 60;

// =============================================================================
// COMPONENT
// =============================================================================

export function VerifyEmail() {
  usePageTitle('Verify Email');
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();
  const { observer, isLoading: authLoading, refreshObserver } = useObserver();

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Redirect if already verified or not logged in
  useEffect(() => {
    if (!authLoading && !observer) {
      navigate('/login', { replace: true });
    }
    if (!authLoading && observer?.emailVerified) {
      navigate('/home', { replace: true });
    }
  }, [observer, authLoading, navigate]);

  const [verifyEmail, { loading: verifyLoading }] = useMutation(VERIFY_EMAIL_MUTATION, {
    onCompleted: async () => {
      setSuccess(true);
      setError(null);
      // Refresh observer context so emailVerified is updated everywhere
      await refreshObserver();
      // Redirect after showing success message
      setTimeout(() => {
        navigate('/home', { replace: true });
      }, 2000);
    },
    onError: (err) => {
      setError(err.message);
      // Clear code on error
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    },
  });

  const [resendCode, { loading: resendLoading }] = useMutation(SEND_EMAIL_VERIFICATION_MUTATION, {
    onCompleted: () => {
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleInputChange = useCallback((index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    setCode((prev) => {
      const newCode = [...prev];
      newCode[index] = digit;
      return newCode;
    });

    // Auto-focus next input
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  }, [code]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (pastedData.length === CODE_LENGTH) {
      setCode(pastedData.split(''));
      inputRefs.current[CODE_LENGTH - 1]?.focus();
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullCode = code.join('');
    if (fullCode.length !== CODE_LENGTH) {
      setError(t('auth:verification.enterFullCode'));
      return;
    }

    await verifyEmail({ variables: { code: fullCode } });
  }, [code, verifyEmail, t]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || resendLoading) return;
    await resendCode();
  }, [resendCooldown, resendLoading, resendCode]);

  // Auto-submit when all digits are entered
  useEffect(() => {
    const fullCode = code.join('');
    if (fullCode.length === CODE_LENGTH && !verifyLoading && !success) {
      verifyEmail({ variables: { code: fullCode } });
    }
  }, [code, verifyEmail, verifyLoading, success]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background to-primary/5 relative">
      <PageMeta title="Verify Email" description="Verify your email address" path="/verify-email" />
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

      {/* Verification Card */}
      <Card className="w-full max-w-md border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-8">
          {success ? (
            // Success state
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                {t('auth:verification.success')}
              </h2>
              <p className="text-muted-foreground">
                {t('auth:verification.redirecting')}
              </p>
            </div>
          ) : (
            // Code input state
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-secondary" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  {t('auth:verification.title')}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t('auth:verification.description', { email: observer?.email })}
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4">
                  <ErrorMessage title={t('common:errors.error')}>{error}</ErrorMessage>
                </div>
              )}

              {/* Code Input */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleInputChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-14 text-center text-2xl font-bold border-2 border-border rounded-lg focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
                      disabled={verifyLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  {t('auth:verification.expiresIn')}
                </p>

                <Button
                  type="submit"
                  className="w-full bg-secondary hover:bg-secondary/90"
                  disabled={verifyLoading || code.join('').length !== CODE_LENGTH}
                >
                  {verifyLoading ? t('common:states.loading') : t('auth:verification.verify')}
                </Button>
              </form>

              {/* Resend Code */}
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('auth:verification.didntReceive')}
                </p>
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resendLoading}
                  className="inline-flex items-center gap-2 text-secondary hover:text-secondary/80 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${resendLoading ? 'animate-spin' : ''}`} />
                  {resendCooldown > 0
                    ? t('auth:verification.resendIn', { seconds: resendCooldown })
                    : t('auth:verification.resendCode')
                  }
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
