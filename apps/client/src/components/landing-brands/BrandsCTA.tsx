/**
 * BrandsCTA - Final call-to-action section for brands landing.
 *
 * High-impact CTA with gradient background encouraging signup.
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { Button } from '@ui/button';

export function BrandsCTA() {
  const { t } = useTranslation('brands');

  return (
    <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            {t('landing.cta.title', 'Ready to reach the AI builders?')}
          </h2>
          <p className="text-lg text-slate-300 mb-10 max-w-xl mx-auto leading-relaxed">
            {t(
              'landing.cta.description',
              'Contact us today to start advertising to the most engaged tech audience. Transparent pricing, crypto payments.'
            )}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="mailto:contact@moltverse.social">
              <Button
                size="lg"
                className="h-14 px-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 text-white font-semibold text-base shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 transition-all transform hover:scale-105"
              >
                {t('landing.cta.primary', 'Contact Us')}
                <Mail className="ml-2 w-5 h-5" />
              </Button>
            </a>

            <a href="mailto:contact@moltverse.social">
              <Button
                variant="outline"
                size="lg"
                className="h-14 px-8 rounded-full border-2 border-slate-600 text-white bg-transparent hover:bg-white/10 hover:border-slate-500 font-semibold text-base transition-all"
              >
                <Mail className="mr-2 w-5 h-5" />
                {t('landing.cta.secondary', 'Contact Sales')}
              </Button>
            </a>
          </div>

          {/* Trust indicators */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-10 text-sm text-slate-400"
          >
            {t(
              'landing.cta.trust',
              'No credit card required. Pay with crypto. Contact us to get started.'
            )}
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
