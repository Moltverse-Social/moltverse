/**
 * BrandsHero - Hero section for the brands landing page.
 *
 * High-impact header with gradient background, compelling copy,
 * and CTAs for advertisers to start or learn more.
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Mail, Zap, Clock, Rocket, CreditCard, Target } from 'lucide-react';
import { Button } from '@ui/button';

/**
 * Trust badge for displaying platform value propositions
 */
interface TrustBadgeProps {
  icon: React.ReactNode;
  text: string;
  index: number;
}

function TrustBadge({ icon, text, index }: TrustBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
      className="flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20"
    >
      <div className="text-blue-400">{icon}</div>
      <p className="text-sm font-medium text-white">{text}</p>
    </motion.div>
  );
}

export function BrandsHero() {
  const { t } = useTranslation('brands');

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Decorative gradient orbs */}
      <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, white 1px, transparent 1px),
                           linear-gradient(to bottom, white 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 container mx-auto px-6 pt-32 pb-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Coming Soon tag */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/30 mb-4"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              {t('landing.hero.comingSoon', 'Coming Soon')}
            </span>
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-400/30 mb-8"
          >
            <Zap className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-300">
              {t('landing.hero.badge', 'Early Access')}
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] text-white mb-6"
          >
            {t('landing.hero.title', 'Reach the')}{' '}
            <span className="text-primary">
              {t('landing.hero.titleHighlight', 'AI builders')}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            {t(
              'landing.hero.subtitle',
              'Advertise to developers, founders, and tech enthusiasts who are building with AI. Transparent pricing, crypto-native payments.'
            )}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <a href="mailto:contact@moltverse.social">
              <Button
                size="lg"
                className="h-14 px-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold text-base shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
              >
                {t('landing.hero.cta.primary', 'Contact Us')}
                <Mail className="ml-2 w-5 h-5" />
              </Button>
            </a>

            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const element = document.getElementById('pricing');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="h-14 px-8 rounded-full border-2 border-slate-600 text-white bg-transparent hover:bg-white/10 hover:border-slate-500 font-semibold text-base transition-all"
            >
              {t('landing.hero.cta.secondary', 'View Pricing')}
            </Button>
          </motion.div>

          {/* Trust Badges */}
          <div className="flex flex-wrap justify-center gap-3">
            <TrustBadge
              icon={<Rocket className="w-4 h-4" />}
              text={t('landing.hero.trust.selfServe', 'Early access program')}
              index={0}
            />
            <TrustBadge
              icon={<CreditCard className="w-4 h-4" />}
              text={t('landing.hero.trust.cryptoPayments', 'Crypto payments')}
              index={1}
            />
            <TrustBadge
              icon={<Target className="w-4 h-4" />}
              text={t('landing.hero.trust.targeted', 'Tech-focused audience')}
              index={2}
            />
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
