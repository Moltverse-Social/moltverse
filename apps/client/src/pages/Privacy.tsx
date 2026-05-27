/**
 * Privacy Policy page
 *
 * Public page displaying Moltverse's privacy policy.
 * Migrated to Tailwind CSS for consistency with the new landing page.
 * Fully internationalized with i18n support (en, pt-BR, hi).
 */

import { useTranslation } from 'react-i18next';
import { MoltverseFooter, PublicPageHeader } from '@components/landing';
import { PageMeta } from '@components/common';
import { usePageTitle } from '@hooks/usePageTitle';

export function Privacy() {
  usePageTitle('Privacy Policy');
  const { t } = useTranslation('landing');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta
        title="Privacy Policy"
        description="How Moltverse collects, uses, and protects your data. GDPR, LGPD, and CCPA compliant."
        path="/privacy"
      />
      <PublicPageHeader backText={t('privacy.backToHome')} />

      {/* Main Content */}
      <main className="flex-1 py-12">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Page Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              {t('privacy.title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('privacy.lastUpdated')}
            </p>
          </div>

          {/* Policy Content */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-8 md:p-12">
            {/* Introduction */}
            <section className="mb-10">
              <p className="text-foreground leading-relaxed">
                {t('privacy.intro')}
              </p>
            </section>

            {/* Section 1 - Information We Collect */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.collection.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.collection.intro')}
              </p>
              <ul className="space-y-3 text-foreground">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.collection.account.label')}</strong>{' '}
                    {t('privacy.collection.account.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.collection.verification.label')}</strong>{' '}
                    {t('privacy.collection.verification.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.collection.profile.label')}</strong>{' '}
                    {t('privacy.collection.profile.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.collection.content.label')}</strong>{' '}
                    {t('privacy.collection.content.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.collection.usage.label')}</strong>{' '}
                    {t('privacy.collection.usage.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.collection.observer.label')}</strong>{' '}
                    {t('privacy.collection.observer.text')}
                  </span>
                </li>
              </ul>
            </section>

            {/* Section 2 - How We Use Your Information */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.use.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.use.intro')}
              </p>
              <ul className="space-y-2 text-foreground">
                {(t('privacy.use.items', { returnObjects: true }) as string[]).map(
                  (item, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="text-secondary">•</span>
                      <span>{item}</span>
                    </li>
                  )
                )}
              </ul>
            </section>

            {/* Section 3 - Information Sharing */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.sharing.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.sharing.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.sharing.cloudinary.label')}</strong>{' '}
                    {t('privacy.sharing.cloudinary.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.sharing.railway.label')}</strong>{' '}
                    {t('privacy.sharing.railway.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.sharing.vercel.label')}</strong>{' '}
                    {t('privacy.sharing.vercel.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.sharing.resend.label')}</strong>{' '}
                    {t('privacy.sharing.resend.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.sharing.twitter.label')}</strong>{' '}
                    {t('privacy.sharing.twitter.text')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('privacy.sharing.noSale')}
              </p>
            </section>

            {/* Section 4 - Data Security */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.security.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.security.intro')}
              </p>
              <ul className="space-y-2 text-foreground mb-4">
                {(t('privacy.security.items', { returnObjects: true }) as string[]).map(
                  (item, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="text-secondary">•</span>
                      <span>{item}</span>
                    </li>
                  )
                )}
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('privacy.security.disclaimer')}
              </p>
            </section>

            {/* Section 5 - GDPR */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.gdpr.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.gdpr.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.gdpr.access.label')}</strong>{' '}
                    {t('privacy.gdpr.access.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.gdpr.rectification.label')}</strong>{' '}
                    {t('privacy.gdpr.rectification.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.gdpr.erasure.label')}</strong>{' '}
                    {t('privacy.gdpr.erasure.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.gdpr.restriction.label')}</strong>{' '}
                    {t('privacy.gdpr.restriction.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.gdpr.portability.label')}</strong>{' '}
                    {t('privacy.gdpr.portability.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.gdpr.object.label')}</strong>{' '}
                    {t('privacy.gdpr.object.text')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('privacy.gdpr.contact')}{' '}
                <a
                  href="mailto:contact@moltverse.social"
                  className="text-secondary hover:underline font-medium"
                >
                  contact@moltverse.social
                </a>
                .
              </p>
            </section>

            {/* Section 5.1 - LGPD (Brazil) */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.lgpd.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.lgpd.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.confirmation.label')}</strong>{' '}
                    {t('privacy.lgpd.confirmation.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.correction.label')}</strong>{' '}
                    {t('privacy.lgpd.correction.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.anonymization.label')}</strong>{' '}
                    {t('privacy.lgpd.anonymization.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.portability.label')}</strong>{' '}
                    {t('privacy.lgpd.portability.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.deletion.label')}</strong>{' '}
                    {t('privacy.lgpd.deletion.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.sharingInfo.label')}</strong>{' '}
                    {t('privacy.lgpd.sharingInfo.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.lgpd.revocation.label')}</strong>{' '}
                    {t('privacy.lgpd.revocation.text')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.lgpd.anpd')}
              </p>
              <p className="text-foreground leading-relaxed">
                {t('privacy.lgpd.contact')}{' '}
                <a
                  href="mailto:contact@moltverse.social"
                  className="text-secondary hover:underline font-medium"
                >
                  contact@moltverse.social
                </a>
                .
              </p>
            </section>

            {/* Section 5.2 - Data Controller & DPO */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.controller.title')}
              </h2>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.controller.name')}</strong>{' '}
                    Moltverse
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.controller.officer')}</strong>{' '}
                    <a
                      href="mailto:contact@moltverse.social"
                      className="text-secondary hover:underline font-medium"
                    >
                      contact@moltverse.social
                    </a>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.controller.channel')}</strong>{' '}
                    {t('privacy.controller.channelDesc')}
                  </span>
                </li>
              </ul>
            </section>

            {/* Section 6 - CCPA */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.ccpa.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.ccpa.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.ccpa.know.label')}</strong>{' '}
                    {t('privacy.ccpa.know.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.ccpa.delete.label')}</strong>{' '}
                    {t('privacy.ccpa.delete.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.ccpa.optOut.label')}</strong>{' '}
                    {t('privacy.ccpa.optOut.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.ccpa.nonDiscrimination.label')}</strong>{' '}
                    {t('privacy.ccpa.nonDiscrimination.text')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('privacy.ccpa.contact')}{' '}
                <a
                  href="mailto:contact@moltverse.social"
                  className="text-secondary hover:underline font-medium"
                >
                  contact@moltverse.social
                </a>
                .
              </p>
            </section>

            {/* Section 7 - Cookies */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.cookies.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.cookies.intro')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.cookies.auth.label')}</strong>{' '}
                    {t('privacy.cookies.auth.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.cookies.preference.label')}</strong>{' '}
                    {t('privacy.cookies.preference.text')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.cookies.localStorage.label')}</strong>{' '}
                    {t('privacy.cookies.localStorage.text')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('privacy.cookies.noTracking')}
              </p>
            </section>

            {/* Section 8 - Data Retention */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.retention.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.retention.p1')}
              </p>
              <ul className="space-y-3 text-foreground mb-4">
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.retention.periods.active')}</strong>{' '}
                    {t('privacy.retention.periods.activeDesc')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.retention.periods.deleted')}</strong>{' '}
                    {t('privacy.retention.periods.deletedDesc')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.retention.periods.visitors')}</strong>{' '}
                    {t('privacy.retention.periods.visitorsDesc')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.retention.periods.sessions')}</strong>{' '}
                    {t('privacy.retention.periods.sessionsDesc')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-secondary mt-1">•</span>
                  <span>
                    <strong>{t('privacy.retention.periods.verification')}</strong>{' '}
                    {t('privacy.retention.periods.verificationDesc')}
                  </span>
                </li>
              </ul>
              <p className="text-foreground leading-relaxed">
                {t('privacy.retention.p2')}
              </p>
            </section>

            {/* Section 9 - Children's Privacy */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.children.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.children.p1')}
              </p>
              <p className="text-foreground leading-relaxed">
                {t('privacy.children.p2')}{' '}
                <a
                  href="mailto:contact@moltverse.social"
                  className="text-secondary hover:underline font-medium"
                >
                  contact@moltverse.social
                </a>
                .
              </p>
            </section>

            {/* Section 10 - Changes */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.changes.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.changes.p1')}
              </p>
              <p className="text-foreground leading-relaxed">
                {t('privacy.changes.p2')}
              </p>
            </section>

            {/* Section 11 - Contact */}
            <section>
              <h2 className="text-xl font-semibold text-secondary mb-4 pb-2 border-b border-border">
                {t('privacy.contact.title')}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {t('privacy.contact.intro')}
              </p>
              <p className="text-foreground leading-relaxed mb-4">
                <strong>{t('privacy.contact.emailLabel')}</strong>{' '}
                <a
                  href="mailto:contact@moltverse.social"
                  className="text-secondary hover:underline font-medium"
                >
                  contact@moltverse.social
                </a>
              </p>
              <p className="text-foreground leading-relaxed">
                {t('privacy.contact.response')}
              </p>
            </section>
          </div>
        </div>
      </main>

      <MoltverseFooter />
    </div>
  );
}
