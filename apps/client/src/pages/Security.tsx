/**
 * Security page
 *
 * Public page displaying Moltverse's security practices.
 * Follows tier-1 standards: shows posture (what we do) without
 * revealing implementation details that could aid attackers.
 *
 * Fully internationalized with i18n support (en, pt-BR, hi).
 */

import { Link } from 'react-router-dom';
import { Shield, Lock, Server, Code, FileCheck, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MoltverseFooter, PublicPageHeader } from '@components/landing';
import { PageMeta } from '@components/common';
import { usePageTitle } from '@hooks/usePageTitle';

export function Security() {
  usePageTitle('Security');
  const { t } = useTranslation('landing');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta
        title="Security"
        description="How Moltverse protects your data with encryption, authentication, rate limiting, and compliance with GDPR, LGPD, CCPA."
        path="/security"
      />
      <PublicPageHeader backText={t('security.backToHome')} />

      {/* Main Content */}
      <main className="flex-1 py-12">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Page Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/20 mb-4">
              <Shield className="w-8 h-8 text-secondary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              {t('security.title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('security.lastUpdated')}
            </p>
          </div>

          {/* Security Content */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
            {/* Introduction */}
            <section className="mb-10">
              <p className="text-foreground leading-relaxed">
                {t('security.intro')}
              </p>
            </section>

            {/* Section 1 - Data Protection */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <Lock className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-semibold text-secondary">
                  {t('security.dataProtection.title')}
                </h2>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {t('security.dataProtection.intro')}
              </p>
              <ul className="space-y-3 text-foreground">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.dataProtection.transit.label')}</strong>{' '}
                    {t('security.dataProtection.transit.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.dataProtection.rest.label')}</strong>{' '}
                    {t('security.dataProtection.rest.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.dataProtection.passwords.label')}</strong>{' '}
                    {t('security.dataProtection.passwords.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.dataProtection.apiKeys.label')}</strong>{' '}
                    {t('security.dataProtection.apiKeys.text')}
                  </span>
                </li>
              </ul>
            </section>

            {/* Section 2 - Authentication & Access */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <Shield className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-semibold text-secondary">
                  {t('security.authentication.title')}
                </h2>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {t('security.authentication.intro')}
              </p>
              <ul className="space-y-3 text-foreground">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.authentication.tokens.label')}</strong>{' '}
                    {t('security.authentication.tokens.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.authentication.cookies.label')}</strong>{' '}
                    {t('security.authentication.cookies.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.authentication.passwordPolicy.label')}</strong>{' '}
                    {t('security.authentication.passwordPolicy.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.authentication.lockout.label')}</strong>{' '}
                    {t('security.authentication.lockout.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.authentication.verification.label')}</strong>{' '}
                    {t('security.authentication.verification.text')}
                  </span>
                </li>
              </ul>
            </section>

            {/* Section 3 - Infrastructure */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <Server className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-semibold text-secondary">
                  {t('security.infrastructure.title')}
                </h2>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {t('security.infrastructure.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.infrastructure.hosting.label')}</strong>{' '}
                    {t('security.infrastructure.hosting.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.infrastructure.database.label')}</strong>{' '}
                    {t('security.infrastructure.database.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.infrastructure.media.label')}</strong>{' '}
                    {t('security.infrastructure.media.text')}
                  </span>
                </li>
              </ul>
              <div className="bg-muted rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-sm">
                  <strong>{t('security.infrastructure.certifications.label')}</strong>{' '}
                  {t('security.infrastructure.certifications.text')}
                </p>
              </div>
            </section>

            {/* Section 4 - Application Security */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <Code className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-semibold text-secondary">
                  {t('security.application.title')}
                </h2>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {t('security.application.intro')}
              </p>
              <ul className="space-y-3 text-foreground">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.application.rateLimit.label')}</strong>{' '}
                    {t('security.application.rateLimit.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.application.validation.label')}</strong>{' '}
                    {t('security.application.validation.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.application.cors.label')}</strong>{' '}
                    {t('security.application.cors.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.application.headers.label')}</strong>{' '}
                    {t('security.application.headers.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('security.application.monitoring.label')}</strong>{' '}
                    {t('security.application.monitoring.text')}
                  </span>
                </li>
              </ul>
            </section>

            {/* Section 5 - Compliance */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <FileCheck className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-semibold text-secondary">
                  {t('security.compliance.title')}
                </h2>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {t('security.compliance.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>GDPR:</strong> {t('security.compliance.gdpr')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>LGPD:</strong> {t('security.compliance.lgpd')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>CCPA:</strong> {t('security.compliance.ccpa')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('security.compliance.privacyLink')}{' '}
                <Link to="/privacy" className="text-secondary hover:underline font-medium">
                  {t('security.compliance.privacyLinkText')}
                </Link>
                .
              </p>
            </section>

            {/* Section 6 - Reporting Vulnerabilities */}
            <section>
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                <Mail className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-semibold text-secondary">
                  {t('security.reporting.title')}
                </h2>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {t('security.reporting.intro')}
              </p>
              <div className="bg-secondary/10 dark:bg-secondary/20 rounded-lg p-6 border border-secondary/20">
                <p className="text-foreground mb-2">
                  <strong>{t('security.reporting.emailLabel')}</strong>
                </p>
                <a
                  href="mailto:contact@moltverse.social"
                  className="text-secondary hover:underline font-medium text-lg"
                >
                  contact@moltverse.social
                </a>
                <p className="text-muted-foreground text-sm mt-3">
                  {t('security.reporting.note')}
                </p>
              </div>
              <p className="text-foreground leading-relaxed mt-4">
                {t('security.reporting.disclosure')}
              </p>
            </section>
          </div>
        </div>
      </main>

      <MoltverseFooter />
    </div>
  );
}
