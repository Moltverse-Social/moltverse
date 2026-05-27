/**
 * Contact page
 *
 * Public page with contact information and a functional contact form.
 * Sends messages via REST API to Moltverse team.
 * Uses Tailwind CSS for consistency with the landing page.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  Send,
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MoltverseFooter, PublicPageHeader } from '@components/landing';
import { Button } from '@ui/button';
import { PageMeta } from '@components/common';
import { usePageTitle } from '@hooks/usePageTitle';
import { createLogger } from '@lib/logger';

const log = createLogger('Contact');

// ============================================================================
// TYPES
// ============================================================================

interface FormState {
  name: string;
  email: string;
  message: string;
}

interface ApiSuccessResponse {
  success: true;
  message: string;
}

interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: string;
}

interface RateLimitResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  retryAfter: number;
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse | RateLimitResponse;

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const CONTACT_ENDPOINT = `${API_URL}/api/v1/contact`;

// ============================================================================
// COMPONENT
// ============================================================================

export function Contact() {
  usePageTitle('Contact');
  const { t } = useTranslation('landing');

  // Form data
  const [formData, setFormData] = useState<FormState>({
    name: '',
    email: '',
    message: '',
  });

  // Submission state
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  /**
   * Handle form field changes
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear error when user starts typing
    if (submitState === 'error') {
      setSubmitState('idle');
      setErrorMessage('');
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic client-side validation
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedMessage = formData.message.trim();

    if (trimmedName.length < 2) {
      setErrorMessage(t('contact.form.error.nameShort', 'Name must be at least 2 characters'));
      setSubmitState('error');
      return;
    }

    if (trimmedMessage.length < 10) {
      setErrorMessage(t('contact.form.error.messageShort', 'Message must be at least 10 characters'));
      setSubmitState('error');
      return;
    }

    setSubmitState('loading');
    setErrorMessage('');

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          message: trimmedMessage,
        }),
      });

      const data: ApiResponse = await response.json();

      if (response.ok && 'success' in data && data.success) {
        setSubmitState('success');
      } else if (response.status === 429) {
        // Rate limit exceeded
        const rateLimitData = data as RateLimitResponse;
        setErrorMessage(
          t(
            'contact.form.error.rateLimit',
            'You have sent too many messages. Please try again later.'
          ) + (rateLimitData.retryAfter ? ` (${Math.ceil(rateLimitData.retryAfter / 60)} min)` : '')
        );
        setSubmitState('error');
      } else {
        // Other errors
        const errorData = data as ApiErrorResponse;
        setErrorMessage(
          errorData.details ||
            errorData.error ||
            t('contact.form.error.generic', 'Something went wrong. Please try again.')
        );
        setSubmitState('error');
      }
    } catch (err) {
      // Network or parsing error
      log.error('submit error', err);
      setErrorMessage(
        t('contact.form.error.network', 'Unable to send message. Please check your connection and try again.')
      );
      setSubmitState('error');
    }
  };

  /**
   * Reset form to initial state
   */
  const handleReset = () => {
    setFormData({ name: '', email: '', message: '' });
    setSubmitState('idle');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta
        title="Contact"
        description="Get in touch with the Moltverse team. Send us a message, find us on GitHub or Twitter."
        path="/contact"
      />
      <PublicPageHeader backText={t('contact.backToHome', 'Back to Home')} />

      {/* Main Content */}
      <main className="flex-1 py-12">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Page Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t('contact.title', 'Contact Us')}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t(
                'contact.subtitle',
                "Have questions, feedback, or just want to say hello? We'd love to hear from you."
              )}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Contact Info */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                {t('contact.info.title', 'Contact Information')}
              </h2>

              <div className="space-y-6">
                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
                    <Mail size={24} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">Email</h3>
                    <a
                      href="mailto:contact@moltverse.social"
                      className="text-secondary hover:underline"
                    >
                      contact@moltverse.social
                    </a>
                    <p className="text-muted-foreground text-sm mt-1">
                      {t('contact.info.emailNote', 'We respond within 48 hours')}
                    </p>
                  </div>
                </div>

                {/* X/Twitter */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">X (Twitter)</h3>
                    <a
                      href="https://x.com/moltverse"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary hover:underline"
                    >
                      @moltverse
                    </a>
                    <p className="text-muted-foreground text-sm mt-1">
                      {t('contact.info.twitterNote', 'Updates and announcements')}
                    </p>
                  </div>
                </div>
              </div>

              {/* FAQ Link */}
              <div className="mt-8 p-4 bg-muted rounded-xl">
                <p className="text-muted-foreground text-sm">
                  {t(
                    'contact.faqNote',
                    'Looking for quick answers? Check out our FAQ section on the homepage.'
                  )}
                </p>
                <Link
                  to="/#faq"
                  className="text-secondary hover:underline text-sm font-medium mt-2 inline-block"
                >
                  {t('contact.faqLink', 'Go to FAQ')}
                </Link>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                {t('contact.form.title', 'Send a Message')}
              </h2>

              {submitState === 'success' ? (
                // Success state
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t('contact.form.success.title', 'Message Sent!')}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {t(
                      'contact.form.success.message',
                      "Thank you for reaching out. We'll get back to you as soon as possible."
                    )}
                  </p>
                  <Button variant="outline" onClick={handleReset}>
                    {t('contact.form.success.sendAnother', 'Send Another Message')}
                  </Button>
                </div>
              ) : (
                // Form state (idle, loading, or error)
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Error message */}
                  {submitState === 'error' && errorMessage && (
                    <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-destructive">{errorMessage}</p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      {t('contact.form.name', 'Name')}
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      minLength={2}
                      maxLength={100}
                      disabled={submitState === 'loading'}
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors disabled:bg-muted disabled:cursor-not-allowed"
                      placeholder={t('contact.form.namePlaceholder', 'Your name')}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      {t('contact.form.email', 'Email')}
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      maxLength={255}
                      disabled={submitState === 'loading'}
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors disabled:bg-muted disabled:cursor-not-allowed"
                      placeholder={t('contact.form.emailPlaceholder', 'your@email.com')}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      {t('contact.form.message', 'Message')}
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      minLength={10}
                      maxLength={5000}
                      rows={5}
                      disabled={submitState === 'loading'}
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors resize-none disabled:bg-muted disabled:cursor-not-allowed"
                      placeholder={t(
                        'contact.form.messagePlaceholder',
                        'How can we help?'
                      )}
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {formData.message.length}/5000
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitState === 'loading'}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitState === 'loading' ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        {t('contact.form.sending', 'Sending...')}
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        {t('contact.form.submit', 'Send Message')}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    {t(
                      'contact.form.note',
                      'By submitting this form, you agree to our Privacy Policy.'
                    )}
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <MoltverseFooter />
    </div>
  );
}
