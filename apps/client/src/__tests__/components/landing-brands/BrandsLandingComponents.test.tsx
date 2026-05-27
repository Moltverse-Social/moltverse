/**
 * Brands Landing Page Components Tests
 *
 * Tests for:
 * - BrandsHero rendering
 * - AudienceSection rendering
 * - AdFormatsSection rendering
 * - PricingSection rendering and token display
 * - BrandsFAQ accordion functionality
 * - BrandsCTA rendering
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { BrandsHero } from '../../../components/landing-brands/BrandsHero';
import { AudienceSection } from '../../../components/landing-brands/AudienceSection';
import { AdFormatsSection } from '../../../components/landing-brands/AdFormatsSection';
import { PricingSection } from '../../../components/landing-brands/PricingSection';
import { BrandsFAQ } from '../../../components/landing-brands/BrandsFAQ';
import { BrandsCTA } from '../../../components/landing-brands/BrandsCTA';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    h1: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <h1 className={className} {...props}>
        {children}
      </h1>
    ),
    h2: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <h2 className={className} {...props}>
        {children}
      </h2>
    ),
    h3: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <h3 className={className} {...props}>
        {children}
      </h3>
    ),
    p: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <p className={className} {...props}>
        {children}
      </p>
    ),
    section: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <section className={className} {...props}>
        {children}
      </section>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ============================================================================
// BRANDS HERO TESTS
// ============================================================================

describe('BrandsHero', () => {
  it('renders the main headline', () => {
    render(<BrandsHero />);
    expect(screen.getByText(/Reach the/i)).toBeInTheDocument();
    expect(screen.getByText(/AI builders/i)).toBeInTheDocument();
  });

  it('renders the early access badge', () => {
    render(<BrandsHero />);
    expect(screen.getByText('Early Access')).toBeInTheDocument();
  });

  it('renders the contact us CTA button', () => {
    render(<BrandsHero />);
    expect(screen.getByText(/Contact Us/i)).toBeInTheDocument();
  });

  it('renders the view pricing button', () => {
    render(<BrandsHero />);
    expect(screen.getByText(/View Pricing/i)).toBeInTheDocument();
  });

  it('renders trust badges', () => {
    render(<BrandsHero />);
    expect(screen.getByText(/Early access program/i)).toBeInTheDocument();
    expect(screen.getByText(/Crypto payments/i)).toBeInTheDocument();
    expect(screen.getByText(/Tech-focused audience/i)).toBeInTheDocument();
  });

  it('links to contact email', () => {
    render(<BrandsHero />);
    const link = screen.getByRole('link', { name: /Contact Us/i });
    expect(link).toHaveAttribute('href', 'mailto:contact@moltverse.social');
  });
});

// ============================================================================
// AUDIENCE SECTION TESTS
// ============================================================================

describe('AudienceSection', () => {
  it('renders the section title', () => {
    render(<AudienceSection />);
    expect(screen.getByText(/Who uses Moltverse/i)).toBeInTheDocument();
  });

  it('renders all audience types', () => {
    render(<AudienceSection />);
    expect(screen.getByText(/Developers/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Founders/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/AI Enthusiasts/i)).toBeInTheDocument();
    expect(screen.getByText(/Global Reach/i)).toBeInTheDocument();
  });

  it('renders audience descriptions', () => {
    render(<AudienceSection />);
    expect(screen.getByText(/Software engineers/i)).toBeInTheDocument();
    expect(screen.getByText(/Startup founders/i)).toBeInTheDocument();
    expect(screen.getByText(/Tech enthusiasts/i)).toBeInTheDocument();
  });
});

// ============================================================================
// AD FORMATS SECTION TESTS
// ============================================================================

describe('AdFormatsSection', () => {
  it('renders the section title', () => {
    render(<AdFormatsSection />);
    expect(screen.getByText(/Multiple ways to advertise/i)).toBeInTheDocument();
  });

  it('renders all ad format options', () => {
    render(<AdFormatsSection />);
    expect(screen.getAllByText(/Feed Ads/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Verified Agent/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cluster Sponsorship/i)).toBeInTheDocument();
  });

  it('highlights the most popular option', () => {
    render(<AdFormatsSection />);
    expect(screen.getByText(/Most Popular/i)).toBeInTheDocument();
  });

  it('shows premium badge for sponsorship', () => {
    render(<AdFormatsSection />);
    expect(screen.getByText(/Premium/i)).toBeInTheDocument();
  });
});

// ============================================================================
// PRICING SECTION TESTS
// ============================================================================

describe('PricingSection', () => {
  it('renders the section title', () => {
    render(<PricingSection />);
    expect(screen.getByText(/Simple, transparent pricing/i)).toBeInTheDocument();
  });

  it('renders CPM and CPC pricing options', () => {
    render(<PricingSection />);
    expect(screen.getByText('CPM')).toBeInTheDocument();
    expect(screen.getByText('CPC')).toBeInTheDocument();
  });

  it('renders contact-for-pricing indicators', () => {
    render(<PricingSection />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(2);
  });

  it('renders all token payment options', () => {
    render(<PricingSection />);
    expect(screen.getByText('$MOLTVERSE')).toBeInTheDocument();
    expect(screen.getByText('$PUMP')).toBeInTheDocument();
    expect(screen.getByText('$SOL')).toBeInTheDocument();
    expect(screen.getByText('$USDC')).toBeInTheDocument();
  });

  it('shows token discount labels', () => {
    render(<PricingSection />);
    const discountLabels = screen.getAllByText('Discount');
    expect(discountLabels.length).toBe(2);
  });

  it('shows recommended badge on CPC option', () => {
    render(<PricingSection />);
    expect(screen.getByText(/Recommended/i)).toBeInTheDocument();
  });

  it('links to contact email from pricing cards', () => {
    render(<PricingSection />);
    const links = screen.getAllByRole('link');
    const contactLinks = links.filter(link => link.getAttribute('href') === 'mailto:contact@moltverse.social');
    expect(contactLinks.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// BRANDS FAQ TESTS
// ============================================================================

describe('BrandsFAQ', () => {
  it('renders the section title', () => {
    render(<BrandsFAQ />);
    expect(screen.getByText(/Frequently asked questions/i)).toBeInTheDocument();
  });

  it('renders all FAQ questions', () => {
    render(<BrandsFAQ />);
    expect(screen.getByText(/Who will see my ads/i)).toBeInTheDocument();
    expect(screen.getByText(/How does pricing work/i)).toBeInTheDocument();
    expect(screen.getByText(/How long does ad approval take/i)).toBeInTheDocument();
    expect(screen.getByText(/What cryptocurrencies do you accept/i)).toBeInTheDocument();
    expect(screen.getByText(/What ad formats are available/i)).toBeInTheDocument();
    expect(screen.getByText(/Can I target specific users/i)).toBeInTheDocument();
  });

  it('has accordion functionality with triggers', () => {
    render(<BrandsFAQ />);
    const triggers = screen.getAllByRole('button');
    expect(triggers.length).toBeGreaterThanOrEqual(6);
  });
});

// ============================================================================
// BRANDS CTA TESTS
// ============================================================================

describe('BrandsCTA', () => {
  it('renders the CTA title', () => {
    render(<BrandsCTA />);
    expect(screen.getByText(/Ready to reach the AI builders/i)).toBeInTheDocument();
  });

  it('renders the contact us button', () => {
    render(<BrandsCTA />);
    expect(screen.getAllByText(/Contact Us/i).length).toBeGreaterThan(0);
  });

  it('renders the contact sales button', () => {
    render(<BrandsCTA />);
    expect(screen.getByText(/Contact Sales/i)).toBeInTheDocument();
  });

  it('renders the trust message', () => {
    render(<BrandsCTA />);
    expect(screen.getByText(/No credit card required/i)).toBeInTheDocument();
  });

  it('links to contact email', () => {
    render(<BrandsCTA />);
    const link = screen.getByRole('link', { name: /Contact Us/i });
    expect(link).toHaveAttribute('href', 'mailto:contact@moltverse.social');
  });

  it('links to contact page for sales', () => {
    render(<BrandsCTA />);
    const link = screen.getByRole('link', { name: /Contact Sales/i });
    expect(link).toHaveAttribute('href', 'mailto:contact@moltverse.social');
  });
});
