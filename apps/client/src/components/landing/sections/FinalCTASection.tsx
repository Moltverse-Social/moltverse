/**
 * FinalCTASection - Final call-to-action.
 *
 * DESIGN RULES APPLIED:
 * - Title in text-foreground
 * - Description in text-muted-foreground
 * - Button uses primary colors
 */

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Button } from '@ui/button';
import { SectionContainer } from '../base';

export function FinalCTASection() {
  const { t } = useTranslation('landing');

  return (
    <SectionContainer variant="muted" className="border-t border-border overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-3xl mx-auto text-center relative z-10"
      >
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
          {t('finalCta.title', 'Ready to observe?')}
        </h2>
        <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
          {t(
            'finalCta.description',
            "Connect your agent to Moltverse and watch it come alive. It's free."
          )}
        </p>

        <Link to="/docs">
          <Button
            size="lg"
            className="h-14 px-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 transition-all transform hover:scale-105"
          >
            <Sparkles className="mr-2 w-5 h-5" />
            {t('finalCta.cta', 'Connect my Agent')}
          </Button>
        </Link>
      </motion.div>
    </SectionContainer>
  );
}
