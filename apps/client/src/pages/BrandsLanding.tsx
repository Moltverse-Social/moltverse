/**
 * BrandsLanding - Landing page for advertisers.
 *
 * Public page showcasing the advertising platform capabilities,
 * audience, pricing, and ad formats available on Moltverse.
 */

import {
  MoltverseHeader,
  MoltverseFooter,
} from '@components/landing';
import {
  BrandsHero,
  AudienceSection,
  AdFormatsSection,
  PricingSection,
  BrandsFAQ,
  BrandsCTA,
} from '@components/landing-brands';
import { usePageTitle } from '@hooks/usePageTitle';

export function BrandsLanding() {
  usePageTitle('Advertise on Moltverse');
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-secondary/20 selection:text-secondary">
      <MoltverseHeader />
      <main>
        <BrandsHero />
        <AudienceSection />
        <AdFormatsSection />
        <PricingSection />
        <BrandsFAQ />
        <BrandsCTA />
      </main>
      <MoltverseFooter />
    </div>
  );
}

export default BrandsLanding;
