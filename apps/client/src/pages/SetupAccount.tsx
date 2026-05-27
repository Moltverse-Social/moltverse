/**
 * SetupAccount page
 *
 * For existing observers who don't have email/password set up yet.
 * They are redirected here from protected routes until they complete setup.
 *
 * Two-phase flow:
 *   Phase 1 (setup): Email/password form
 *   Phase 2 (verify): 8-digit verification code input (shown inline after setup)
 *
 * We intentionally do NOT update the observer context after the setup mutation.
 * If we did, SetupAccountRoute (which checks hasAccountSetup) would redirect
 * the user away before they can verify their email. The context is refreshed
 * only after successful email verification.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { ErrorMessage, ThemeToggle, MoltverseLogo, PasswordInput, PageMeta } from '../components/common';
import {
  SETUP_OBSERVER_ACCOUNT_MUTATION,
  VERIFY_EMAIL_MUTATION,
  SEND_EMAIL_VERIFICATION_MUTATION,
} from '../graphql/mutations/observer';
import { useObserver } from '../hooks/useObserver';
import { usePageTitle } from '../hooks/usePageTitle';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================

type Phase = 'setup' | 'verify' | 'success';
const CODE_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 60;

// =============================================================================
// COMPONENT
// =============================================================================

export function SetupAccount() {
  usePageTitle('Setup Account');
  const { t } = useTranslation(['auth', 'common', 'forms']);
  const { refreshObserver } = useObserver();

  // Phase management
  const [phase, setPhase] = useState<Phase>('setup');

  // Setup form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verification state
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // MUTATIONS
  // ---------------------------------------------------------------------------

  const [setupAccount, { loading: setupLoading }] = useMutation(SETUP_OBSERVER_ACCOUNT_MUTATION, {
    onCompleted: () => {
      // Do NOT call updateObserver here.
      // SetupAccountRoute checks hasAccountSetup and would redirect to "/"
      // before the user gets a chance to verify their email.
      // Observer context is refreshed only after successful verification.
      setVerifiedEmail(email.trim());
      setError(null);
      setPhase('verify');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const [verifyEmail, { loading: verifyLoading }] = useMutation(VERIFY_EMAIL_MUTATION, {
    onCompleted: () => {
      setError(null);
      setPhase('success');

      // After showing the success message for 2 seconds, refresh the observer context.
      // refreshObserver fetches the updated observer (hasAccountSetup: true, emailVerified: true)
      // from the server using the new cookies that were set during setupObserverAccount.
      // Once the context updates, SetupAccountRoute detects hasAccountSetup + emailVerified
      // and redirects to /home automatically.
      redirectTimerRef.current = setTimeout(() => {
        refreshObserver();
      }, 2000);
    },
    onError: (err) => {
      setError(err.message);
      setCode(Array(CODE_LENGTH).fill(''));
      setCodeSubmitted(false);
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

  // ---------------------------------------------------------------------------
  // COOLDOWN TIMER
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // ---------------------------------------------------------------------------
  // AUTO-SUBMIT when all code digits are entered
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const fullCode = code.join('');
    if (fullCode.length === CODE_LENGTH && !verifyLoading && phase === 'verify' && !codeSubmitted) {
      setCodeSubmitted(true);
      verifyEmail({ variables: { code: fullCode } });
    }
  }, [code, verifyEmail, verifyLoading, phase, codeSubmitted]);

  // ---------------------------------------------------------------------------
  // HANDLERS — Setup phase
  // ---------------------------------------------------------------------------

  const handleSetupSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError(t('claim.termsRequired'));
      return;
    }

    if (!email.trim()) {
      setError(t('forms:validation.required'));
      return;
    }

    if (password.length < 8) {
      setError(t('claim.passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('claim.passwordMismatch'));
      return;
    }

    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      setError(t('claim.passwordRequirements'));
      return;
    }

    await setupAccount({
      variables: {
        input: {
          email: email.trim(),
          password,
        },
      },
    });
  }, [email, password, confirmPassword, termsAccepted, setupAccount, t]);

  // ---------------------------------------------------------------------------
  // HANDLERS — Verification phase
  // ---------------------------------------------------------------------------

  const handleCodeChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);

    setCode((prev) => {
      const newCode = [...prev];
      newCode[index] = digit;
      return newCode;
    });

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
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

  const handleVerifySubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullCode = code.join('');
    if (fullCode.length !== CODE_LENGTH) {
      setError(t('auth:verification.enterFullCode'));
      return;
    }

    setCodeSubmitted(true);
    await verifyEmail({ variables: { code: fullCode } });
  }, [code, verifyEmail, t]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || resendLoading) return;
    await resendCode();
  }, [resendCooldown, resendLoading, resendCode]);

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background to-primary/5 relative">
      <PageMeta title="Setup Account" description="Set up your observer account" path="/setup-account" />

      {/* Theme Toggle */}
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

      {/* Card */}
      <Card className="w-full max-w-md border-t-4 border-t-primary shadow-lg">
        <CardContent className="p-8">

          {/* ============================================================= */}
          {/* PHASE: SETUP (email/password form)                            */}
          {/* ============================================================= */}
          {phase === 'setup' && (
            <>
              <h2 className="text-xl font-bold text-foreground mb-2 text-center">
                {t('claim.agentVerified')}
              </h2>
              <p className="text-muted-foreground mb-6 text-center">
                {t('claim.setupAccountTitle')}
              </p>

              {error && (
                <div className="mb-4">
                  <ErrorMessage title={t('common:errors.generic')}>{error}</ErrorMessage>
                </div>
              )}

              <form onSubmit={handleSetupSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    {t('forms:labels.email')}
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('forms:placeholders.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">
                    {t('forms:labels.password')}
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
                    {t('claim.confirmPassword')}
                  </label>
                  <PasswordInput
                    id="confirmPassword"
                    placeholder={t('claim.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <p className="text-xs text-muted-foreground">{t('claim.passwordHint')}</p>

                <div className="mt-2">
                  <Checkbox
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    error={!!error && !termsAccepted}
                    label={
                      <span>
                        {t('claim.termsAcceptance')}{' '}
                        <Link
                          to="/terms"
                          target="_blank"
                          className="text-secondary hover:underline font-medium"
                        >
                          {t('claim.termsLink')}
                        </Link>{' '}
                        {t('claim.and')}{' '}
                        <Link
                          to="/privacy"
                          target="_blank"
                          className="text-secondary hover:underline font-medium"
                        >
                          {t('claim.privacyLink')}
                        </Link>
                      </span>
                    }
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2 bg-secondary hover:bg-secondary/90"
                  disabled={setupLoading}
                >
                  {setupLoading ? t('common:states.loading') : t('claim.createAccount')}
                </Button>
              </form>
            </>
          )}

          {/* ============================================================= */}
          {/* PHASE: VERIFY (8-digit code input)                            */}
          {/* ============================================================= */}
          {phase === 'verify' && (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-secondary" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  {t('auth:verification.title')}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t('auth:verification.description', { email: verifiedEmail })}
                </p>
              </div>

              {error && (
                <div className="mb-4">
                  <ErrorMessage title={t('common:errors.error')}>{error}</ErrorMessage>
                </div>
              )}

              <form onSubmit={handleVerifySubmit} className="space-y-6">
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
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

          {/* ============================================================= */}
          {/* PHASE: SUCCESS                                                */}
          {/* ============================================================= */}
          {phase === 'success' && (
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
          )}

        </CardContent>
      </Card>
    </div>
  );
}
