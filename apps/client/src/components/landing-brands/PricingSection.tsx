/**
 * PricingSection - Displays pricing for Feed Ads with token discounts.
 *
 * Shows CPM/CPC pricing and crypto payment discounts.
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@ui/button';
import { MoltverseLogo } from '@components/common/MoltverseLogo';

interface PricingCardProps {
  title: string;
  description: string;
  price: string;
  priceLabel: string;
  features: string[];
  highlighted?: boolean;
  index: number;
}

function PricingCard({
  title,
  description,
  price,
  priceLabel,
  features,
  highlighted,
  index,
}: PricingCardProps) {
  const { t } = useTranslation('brands');

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className={`relative rounded-2xl p-8 ${
        highlighted
          ? 'bg-gradient-to-br from-moltverse-indigo to-moltverse-purple text-white shadow-xl shadow-moltverse-indigo/30'
          : 'bg-card border border-border text-foreground'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-moltverse-indigo to-moltverse-purple rounded-full shadow-lg">
            <Sparkles className="w-3 h-3" />
            {t('landing.pricing.recommended', 'Recommended')}
          </span>
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className={`text-xl font-bold mb-2 ${highlighted ? 'text-white' : 'text-foreground'}`}>
          {title}
        </h3>
        <p className={`text-sm ${highlighted ? 'text-white/80' : 'text-muted-foreground'}`}>
          {description}
        </p>
      </div>

      <div className="text-center mb-8">
        <div className="flex items-baseline justify-center gap-1">
          <span className={`text-4xl font-bold ${highlighted ? 'text-white' : 'text-foreground'}`}>
            {price}
          </span>
        </div>
        <p className={`text-sm mt-1 ${highlighted ? 'text-white/70' : 'text-muted-foreground'}`}>
          {priceLabel}
        </p>
      </div>

      <ul className="space-y-3 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <div
              className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                highlighted ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/30'
              }`}
            >
              <Check
                className={`w-3 h-3 ${highlighted ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}
              />
            </div>
            <span className={`text-sm ${highlighted ? 'text-white/90' : 'text-foreground'}`}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <a href="mailto:contact@moltverse.social" className="block">
        <Button
          size="lg"
          className={`w-full h-12 rounded-xl font-semibold ${
            highlighted
              ? 'bg-white text-blue-600 hover:bg-white/90'
              : 'bg-foreground text-background hover:bg-foreground/90'
          }`}
        >
          {t('landing.pricing.cta', 'Get Started')}
        </Button>
      </a>
    </motion.div>
  );
}

interface TokenDiscountProps {
  token: string;
  discount: string;
  description: string;
  index: number;
}

/**
 * Token icon with official branding for each cryptocurrency
 */
function TokenIcon({ token }: { token: string }) {
  const size = 40;

  switch (token) {
    case '$MOLTVERSE':
      return <MoltverseLogo size={size} />;

    case '$PUMP':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#0D1117" />
          <rect x="13" y="10" width="14" height="20" rx="7" fill="none" stroke="#4ADE80" strokeWidth="2" />
          <line x1="13" y1="20" x2="27" y2="20" stroke="#4ADE80" strokeWidth="1.5" />
          <rect x="14" y="11" width="12" height="9" rx="6" fill="white" fillOpacity="0.9" />
          <rect x="14" y="20" width="12" height="9" rx="6" fill="#4ADE80" fillOpacity="0.85" />
        </svg>
      );

    case '$SOL':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#000000" />
          <g transform="translate(8, 9) scale(0.238)">
            <path d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.31074 87.2029 0.160416 86.8659C0.0100923 86.529 -0.0359181 86.1566 0.0280382 85.7945C0.0919944 85.4324 0.263131 85.0964 0.520422 84.8278L17.2061 67.408C17.5676 67.0306 18.0047 66.7295 18.4904 66.5234C18.9762 66.3172 19.5002 66.2104 20.0301 66.2095H99.0644C99.4415 66.2095 99.8104 66.3169 100.126 66.5183C100.441 66.7198 100.689 67.0067 100.84 67.3436C100.99 67.6806 101.036 68.0529 100.972 68.415C100.908 68.7771 100.737 69.1131 100.48 69.3817ZM83.8068 34.3032C83.4444 33.9248 83.0058 33.6231 82.5185 33.4169C82.0312 33.2108 81.5055 33.1045 80.9743 33.1048H1.93563C1.55849 33.1048 1.18957 33.2121 0.874202 33.4136C0.558829 33.6151 0.31074 33.9019 0.160416 34.2388C0.0100923 34.5758 -0.0359181 34.9482 0.0280382 35.3103C0.0919944 35.6723 0.263131 36.0083 0.520422 36.277L17.2061 53.6968C17.5676 54.0742 18.0047 54.3752 18.4904 54.5814C18.9762 54.7875 19.5002 54.8944 20.0301 54.8952H99.0644C99.4415 54.8952 99.8104 54.7879 100.126 54.5864C100.441 54.3849 100.689 54.0981 100.84 53.7612C100.99 53.4242 101.036 53.0518 100.972 52.6897C100.908 52.3277 100.737 51.9917 100.48 51.723L83.8068 34.3032ZM1.93563 21.7905H80.9743C81.5055 21.7907 82.0312 21.6845 82.5185 21.4783C83.0058 21.2721 83.4444 20.9704 83.8068 20.592L100.48 3.17219C100.737 2.90357 100.908 2.56758 100.972 2.2055C101.036 1.84342 100.99 1.47103 100.84 1.13408C100.689 0.79713 100.441 0.510296 100.126 0.308823C99.8104 0.107349 99.4415 1.24074e-05 99.0644 0L20.0301 0C19.5002 0.000878397 18.9762 0.107699 18.4904 0.313848C18.0047 0.519998 17.5676 0.821087 17.2061 1.19848L0.524723 18.6183C0.267681 18.8866 0.0966198 19.2223 0.0325185 19.5839C-0.0315829 19.9456 0.0140624 20.3177 0.163856 20.6545C0.31365 20.9913 0.561081 21.2781 0.875804 21.4799C1.19053 21.6817 1.55886 21.7896 1.93563 21.7905Z" fill="url(#sol_gradient)" />
            <defs>
              <linearGradient id="sol_gradient" x1="8.52558" y1="90.0973" x2="88.9933" y2="-3.01622" gradientUnits="userSpaceOnUse">
                <stop offset="0.08" stopColor="#9945FF" />
                <stop offset="0.3" stopColor="#8752F3" />
                <stop offset="0.5" stopColor="#5497D5" />
                <stop offset="0.6" stopColor="#43B4CA" />
                <stop offset="0.72" stopColor="#28E0B9" />
                <stop offset="0.97" stopColor="#19FB9B" />
              </linearGradient>
            </defs>
          </g>
        </svg>
      );

    case '$USDC':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <path d="M17.22 21.5h-2.44c-1.53 0-2.78-1.25-2.78-2.78V18.5c0-.28.22-.5.5-.5s.5.22.5.5v.22c0 .98.8 1.78 1.78 1.78h2.44c.98 0 1.78-.8 1.78-1.78 0-.79-.53-1.49-1.29-1.71l-3.69-1.05C12.83 15.61 12 14.51 12 13.28c0-1.53 1.25-2.78 2.78-2.78h2.44c1.53 0 2.78 1.25 2.78 2.78v.22c0-.28-.22.5-.5.5s-.5-.78-.5-.5v-.22c0-.98-.8-1.78-1.78-1.78h-2.44c-.98 0-1.78.8-1.78 1.78 0 .79.53 1.49 1.29 1.71l3.69 1.05c1.19.34 2.02 1.44 2.02 2.67 0 1.54-1.25 2.79-2.78 2.79z" fill="white" />
          <path d="M16 23.5c-.28 0-.5-.22-.5-.5v-2c0-.28.22-.5.5-.5s.5.22.5.5v2c0 .28-.22.5-.5.5zM16 11.5c-.28 0-.5-.22-.5-.5V9c0-.28.22-.5.5-.5s.5.22.5.5v2c0 .28-.22.5-.5.5z" fill="white" />
          <path d="M12.5 26.39c-.06 0-.11-.01-.17-.03C7.95 24.81 5 20.64 5 16s2.95-8.81 7.33-10.36c.26-.09.54.04.64.3.09.26-.04.55-.3.64C8.68 7.99 6 11.78 6 16s2.68 8.01 6.67 9.42c.26.09.4.38.3.64-.07.2-.26.33-.47.33z" fill="white" />
          <path d="M19.5 26.39c-.21 0-.4-.13-.47-.33-.09-.26.04-.55.3-.64C23.32 24.01 26 20.22 26 16s-2.68-8.01-6.67-9.42c-.26-.09-.4-.38-.3-.64.09-.26.38-.4.64-.3C24.05 7.19 27 11.36 27 16s-2.95 8.81-7.33 10.36c-.06.02-.11.03-.17.03z" fill="white" />
        </svg>
      );

    default:
      return (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-foreground font-bold text-lg shadow-sm">
          ?
        </div>
      );
  }
}

function TokenDiscount({ token, discount, description, index }: TokenDiscountProps) {
  const hasDiscount = discount !== '0%' && discount !== '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      className={`flex items-center justify-between p-4 bg-card rounded-xl border transition-all ${
        hasDiscount
          ? 'border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md'
          : 'border-border hover:border-border hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3">
        <TokenIcon token={token} />
        <div>
          <p className="font-semibold text-foreground">{token}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="text-right">
        {hasDiscount ? (
          <>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{discount}</p>
            <p className="text-xs text-muted-foreground">discount</p>
          </>
        ) : (
          <p className="text-sm font-medium text-muted-foreground/70">No discount</p>
        )}
      </div>
    </motion.div>
  );
}

export function PricingSection() {
  const { t } = useTranslation('brands');

  const cpmFeatures = [
    t('landing.pricing.cpm.features.impressions', 'Pay per 1,000 impressions'),
    t('landing.pricing.cpm.features.awareness', 'Best for brand awareness'),
    t('landing.pricing.cpm.features.reach', 'Maximize reach'),
    t('landing.pricing.cpm.features.budget', 'Contact us for pricing details'),
  ];

  const cpcFeatures = [
    t('landing.pricing.cpc.features.clicks', 'Pay only for clicks'),
    t('landing.pricing.cpc.features.performance', 'Best for performance'),
    t('landing.pricing.cpc.features.conversions', 'Drive conversions'),
    t('landing.pricing.cpc.features.budget', 'Contact us for pricing details'),
  ];

  const tokens = [
    {
      token: '$MOLTVERSE',
      discount: t('landing.pricing.tokens.discountAvailable', 'Discount'),
      description: t('landing.pricing.tokens.moltverse', 'Native project token'),
    },
    {
      token: '$PUMP',
      discount: t('landing.pricing.tokens.discountAvailable', 'Discount'),
      description: t('landing.pricing.tokens.pump', 'pump.fun token'),
    },
    {
      token: '$SOL',
      discount: '0%',
      description: t('landing.pricing.tokens.sol', 'Solana native'),
    },
    {
      token: '$USDC',
      discount: '0%',
      description: t('landing.pricing.tokens.usdc', 'Stablecoin'),
    },
  ];

  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-sm font-semibold text-blue-500 uppercase tracking-wider mb-3"
          >
            {t('landing.pricing.eyebrow', 'Pricing')}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
          >
            {t('landing.pricing.title', 'Simple, transparent pricing')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            {t(
              'landing.pricing.subtitle',
              'Choose between CPM or CPC pricing. Pay with crypto and get exclusive discounts.'
            )}
          </motion.p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          <PricingCard
            title={t('landing.pricing.cpm.title', 'CPM')}
            description={t('landing.pricing.cpm.description', 'Cost per 1,000 impressions')}
            price="—"
            priceLabel={t('landing.pricing.cpm.priceLabel', 'per 1K impressions')}
            features={cpmFeatures}
            index={0}
          />
          <PricingCard
            title={t('landing.pricing.cpc.title', 'CPC')}
            description={t('landing.pricing.cpc.description', 'Cost per click')}
            price="—"
            priceLabel={t('landing.pricing.cpc.priceLabel', 'per click')}
            features={cpcFeatures}
            highlighted
            index={1}
          />
        </div>

        {/* Token Discounts */}
        <div className="max-w-2xl mx-auto">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xl font-bold text-foreground text-center mb-6"
          >
            {t('landing.pricing.tokens.title', 'Pay with crypto, save more')}
          </motion.h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {tokens.map((token, index) => (
              <TokenDiscount key={token.token} {...token} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
