/**
 * Tests for ads-constants.ts
 *
 * Validates pricing configuration, token discounts, and utility functions
 * for the advertising system.
 */

import { describe, it, expect } from 'vitest';
import {
  isAdsSystemEnabled,
  PRICING,
  ACCEPTED_TOKENS,
  getTokenDiscount,
  calculateDiscountedAmount,
  isValidPaymentToken,
  toPrismaPaymentToken,
  fromPrismaPaymentToken,
  CAMPAIGN_LIMITS,
  AD_DELIVERY,
  ADS_RATE_LIMITS,
  VERIFICATION_TIERS,
  SPONSORSHIP_PRICING,
  ADS_SECURITY,
  VALIDATION_PATTERNS,
} from '../lib/ads-constants.js';
import { PaymentToken } from '@prisma/client';

describe('isAdsSystemEnabled', () => {
  it('should return false when ENABLE_ADS_SYSTEM is not set', () => {
    const original = process.env.ENABLE_ADS_SYSTEM;
    delete process.env.ENABLE_ADS_SYSTEM;
    expect(isAdsSystemEnabled()).toBe(false);
    process.env.ENABLE_ADS_SYSTEM = original;
  });

  it('should return false when ENABLE_ADS_SYSTEM is "false"', () => {
    const original = process.env.ENABLE_ADS_SYSTEM;
    process.env.ENABLE_ADS_SYSTEM = 'false';
    expect(isAdsSystemEnabled()).toBe(false);
    process.env.ENABLE_ADS_SYSTEM = original;
  });

  it('should return true when ENABLE_ADS_SYSTEM is "true"', () => {
    const original = process.env.ENABLE_ADS_SYSTEM;
    process.env.ENABLE_ADS_SYSTEM = 'true';
    expect(isAdsSystemEnabled()).toBe(true);
    process.env.ENABLE_ADS_SYSTEM = original;
  });
});

describe('PRICING', () => {
  it('should have valid CPM bid range', () => {
    expect(PRICING.MIN_CPM_BID).toBe(500); // $5.00
    expect(PRICING.DEFAULT_CPM_BID).toBe(1500); // $15.00
    expect(PRICING.MAX_CPM_BID).toBe(10000); // $100.00
    expect(PRICING.MIN_CPM_BID).toBeLessThan(PRICING.DEFAULT_CPM_BID);
    expect(PRICING.DEFAULT_CPM_BID).toBeLessThan(PRICING.MAX_CPM_BID);
  });

  it('should have valid CPC bid range', () => {
    expect(PRICING.MIN_CPC_BID).toBe(100); // $1.00
    expect(PRICING.DEFAULT_CPC_BID).toBe(200); // $2.00
    expect(PRICING.MAX_CPC_BID).toBe(2000); // $20.00
    expect(PRICING.MIN_CPC_BID).toBeLessThan(PRICING.DEFAULT_CPC_BID);
    expect(PRICING.DEFAULT_CPC_BID).toBeLessThan(PRICING.MAX_CPC_BID);
  });

  it('should have valid minimum budget', () => {
    expect(PRICING.MIN_BUDGET).toBe(2500); // $25.00
    expect(PRICING.MIN_BUDGET).toBeGreaterThan(PRICING.DEFAULT_CPM_BID);
  });
});

describe('ACCEPTED_TOKENS', () => {
  it('should have all required tokens', () => {
    expect(ACCEPTED_TOKENS.MOLTVERSE).toBeDefined();
    expect(ACCEPTED_TOKENS.PUMP).toBeDefined();
    expect(ACCEPTED_TOKENS.SOL).toBeDefined();
    expect(ACCEPTED_TOKENS.USDC).toBeDefined();
  });

  it('should have correct discount percentages', () => {
    expect(ACCEPTED_TOKENS.MOLTVERSE.discountPercent).toBe(20);
    expect(ACCEPTED_TOKENS.PUMP.discountPercent).toBe(10);
    expect(ACCEPTED_TOKENS.SOL.discountPercent).toBe(0);
    expect(ACCEPTED_TOKENS.USDC.discountPercent).toBe(0);
  });

  it('should have correct decimals for each token', () => {
    expect(ACCEPTED_TOKENS.MOLTVERSE.decimals).toBe(9);
    expect(ACCEPTED_TOKENS.PUMP.decimals).toBe(6);
    expect(ACCEPTED_TOKENS.SOL.decimals).toBe(9);
    expect(ACCEPTED_TOKENS.USDC.decimals).toBe(6);
  });

  it('should have valid Solana mint addresses for SOL and USDC', () => {
    expect(ACCEPTED_TOKENS.SOL.mint).toBe('So11111111111111111111111111111111111111112');
    expect(ACCEPTED_TOKENS.USDC.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});

describe('getTokenDiscount', () => {
  it('should return correct discount for MOLTVERSE', () => {
    expect(getTokenDiscount('MOLTVERSE')).toBe(20);
  });

  it('should return correct discount for PUMP', () => {
    expect(getTokenDiscount('PUMP')).toBe(10);
  });

  it('should return correct discount for SOL', () => {
    expect(getTokenDiscount('SOL')).toBe(0);
  });

  it('should return correct discount for USDC', () => {
    expect(getTokenDiscount('USDC')).toBe(0);
  });
});

describe('calculateDiscountedAmount', () => {
  it('should apply 20% discount for MOLTVERSE', () => {
    expect(calculateDiscountedAmount(10000, 'MOLTVERSE')).toBe(8000);
    expect(calculateDiscountedAmount(5000, 'MOLTVERSE')).toBe(4000);
  });

  it('should apply 10% discount for PUMP', () => {
    expect(calculateDiscountedAmount(10000, 'PUMP')).toBe(9000);
    expect(calculateDiscountedAmount(5000, 'PUMP')).toBe(4500);
  });

  it('should apply no discount for SOL', () => {
    expect(calculateDiscountedAmount(10000, 'SOL')).toBe(10000);
    expect(calculateDiscountedAmount(5000, 'SOL')).toBe(5000);
  });

  it('should apply no discount for USDC', () => {
    expect(calculateDiscountedAmount(10000, 'USDC')).toBe(10000);
    expect(calculateDiscountedAmount(5000, 'USDC')).toBe(5000);
  });

  it('should round to nearest cent', () => {
    // 333 * 0.8 = 266.4 -> rounds to 266
    expect(calculateDiscountedAmount(333, 'MOLTVERSE')).toBe(266);
    // 777 * 0.9 = 699.3 -> rounds to 699
    expect(calculateDiscountedAmount(777, 'PUMP')).toBe(699);
  });

  it('should handle zero amount', () => {
    expect(calculateDiscountedAmount(0, 'MOLTVERSE')).toBe(0);
    expect(calculateDiscountedAmount(0, 'USDC')).toBe(0);
  });
});

describe('isValidPaymentToken', () => {
  it('should return true for valid tokens', () => {
    expect(isValidPaymentToken('MOLTVERSE')).toBe(true);
    expect(isValidPaymentToken('PUMP')).toBe(true);
    expect(isValidPaymentToken('SOL')).toBe(true);
    expect(isValidPaymentToken('USDC')).toBe(true);
  });

  it('should return false for invalid tokens', () => {
    expect(isValidPaymentToken('BTC')).toBe(false);
    expect(isValidPaymentToken('ETH')).toBe(false);
    expect(isValidPaymentToken('')).toBe(false);
    expect(isValidPaymentToken('moltverse')).toBe(false); // lowercase
  });
});

describe('toPrismaPaymentToken', () => {
  it('should convert AcceptedToken to PaymentToken', () => {
    expect(toPrismaPaymentToken('MOLTVERSE')).toBe('MOLTVERSE' as PaymentToken);
    expect(toPrismaPaymentToken('PUMP')).toBe('PUMP' as PaymentToken);
    expect(toPrismaPaymentToken('SOL')).toBe('SOL' as PaymentToken);
    expect(toPrismaPaymentToken('USDC')).toBe('USDC' as PaymentToken);
  });
});

describe('fromPrismaPaymentToken', () => {
  it('should convert PaymentToken to AcceptedToken', () => {
    expect(fromPrismaPaymentToken('MOLTVERSE' as PaymentToken)).toBe('MOLTVERSE');
    expect(fromPrismaPaymentToken('PUMP' as PaymentToken)).toBe('PUMP');
    expect(fromPrismaPaymentToken('SOL' as PaymentToken)).toBe('SOL');
    expect(fromPrismaPaymentToken('USDC' as PaymentToken)).toBe('USDC');
  });
});

describe('CAMPAIGN_LIMITS', () => {
  it('should have valid headline limits', () => {
    expect(CAMPAIGN_LIMITS.HEADLINE_MIN_LENGTH).toBe(3);
    expect(CAMPAIGN_LIMITS.HEADLINE_MAX_LENGTH).toBe(100);
    expect(CAMPAIGN_LIMITS.HEADLINE_MIN_LENGTH).toBeLessThan(CAMPAIGN_LIMITS.HEADLINE_MAX_LENGTH);
  });

  it('should have valid description limits', () => {
    expect(CAMPAIGN_LIMITS.DESCRIPTION_MIN_LENGTH).toBe(10);
    expect(CAMPAIGN_LIMITS.DESCRIPTION_MAX_LENGTH).toBe(300);
    expect(CAMPAIGN_LIMITS.DESCRIPTION_MIN_LENGTH).toBeLessThan(CAMPAIGN_LIMITS.DESCRIPTION_MAX_LENGTH);
  });

  it('should have valid URL limits', () => {
    expect(CAMPAIGN_LIMITS.IMAGE_URL_MAX_LENGTH).toBe(500);
    expect(CAMPAIGN_LIMITS.LINK_URL_MAX_LENGTH).toBe(500);
  });
});

describe('AD_DELIVERY', () => {
  it('should have valid frequency cap', () => {
    expect(AD_DELIVERY.FREQUENCY_CAP_HOURS).toBe(1);
    expect(AD_DELIVERY.FREQUENCY_CAP_HOURS).toBeGreaterThan(0);
  });

  it('should have valid feed insertion settings', () => {
    expect(AD_DELIVERY.MIN_FEED_ITEMS_FOR_AD).toBe(5);
    expect(AD_DELIVERY.AD_POSITION_MIN).toBe(4);
    expect(AD_DELIVERY.AD_POSITION_MAX).toBe(6);
    expect(AD_DELIVERY.AD_POSITION_MIN).toBeLessThanOrEqual(AD_DELIVERY.AD_POSITION_MAX);
  });

  it('should have valid performance limits', () => {
    expect(AD_DELIVERY.MAX_CAMPAIGNS_PER_REQUEST).toBe(100);
    expect(AD_DELIVERY.CAMPAIGNS_CACHE_TTL).toBe(60);
  });
});

describe('ADS_RATE_LIMITS', () => {
  it('should have rate limits for all endpoints', () => {
    expect(ADS_RATE_LIMITS.BRAND_REGISTER).toBeDefined();
    expect(ADS_RATE_LIMITS.BRAND_LOGIN).toBeDefined();
    expect(ADS_RATE_LIMITS.CAMPAIGN_CREATE).toBeDefined();
    expect(ADS_RATE_LIMITS.CAMPAIGN_UPDATE).toBeDefined();
    expect(ADS_RATE_LIMITS.AD_NEXT).toBeDefined();
    expect(ADS_RATE_LIMITS.AD_IMPRESSION).toBeDefined();
    expect(ADS_RATE_LIMITS.AD_CLICK).toBeDefined();
  });

  it('should have valid max values', () => {
    expect(ADS_RATE_LIMITS.BRAND_REGISTER.max).toBeGreaterThan(0);
    expect(ADS_RATE_LIMITS.BRAND_LOGIN.max).toBeGreaterThan(0);
    expect(ADS_RATE_LIMITS.AD_NEXT.max).toBeGreaterThanOrEqual(60);
  });
});

describe('VERIFICATION_TIERS', () => {
  it('should have increasing token requirements', () => {
    expect(VERIFICATION_TIERS.VERIFIED).toBe(100_000);
    expect(VERIFICATION_TIERS.PREMIUM).toBe(500_000);
    expect(VERIFICATION_TIERS.ENTERPRISE).toBe(1_000_000);
    expect(VERIFICATION_TIERS.VERIFIED).toBeLessThan(VERIFICATION_TIERS.PREMIUM);
    expect(VERIFICATION_TIERS.PREMIUM).toBeLessThan(VERIFICATION_TIERS.ENTERPRISE);
  });
});

describe('SPONSORSHIP_PRICING', () => {
  it('should have increasing prices for larger communities', () => {
    expect(SPONSORSHIP_PRICING.SMALL).toBe(20000); // $200
    expect(SPONSORSHIP_PRICING.MEDIUM).toBe(50000); // $500
    expect(SPONSORSHIP_PRICING.LARGE).toBe(100000); // $1000
    expect(SPONSORSHIP_PRICING.SMALL).toBeLessThan(SPONSORSHIP_PRICING.MEDIUM);
    expect(SPONSORSHIP_PRICING.MEDIUM).toBeLessThan(SPONSORSHIP_PRICING.LARGE);
  });
});

describe('ADS_SECURITY', () => {
  it('should have valid lockout settings', () => {
    expect(ADS_SECURITY.LOCKOUT_THRESHOLD).toBe(5);
    expect(ADS_SECURITY.LOCKOUT_DURATION_MINUTES).toBe(15);
  });

  it('should have valid token expiration', () => {
    expect(ADS_SECURITY.ACCESS_TOKEN_EXPIRES_IN).toBe('30m');
    expect(ADS_SECURITY.REFRESH_TOKEN_EXPIRES_IN).toBe('7d');
  });

  it('should have valid password requirements', () => {
    expect(ADS_SECURITY.MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe('VALIDATION_PATTERNS', () => {
  describe('HTTPS_URL', () => {
    it('should match valid HTTPS URLs', () => {
      expect(VALIDATION_PATTERNS.HTTPS_URL.test('https://example.com')).toBe(true);
      expect(VALIDATION_PATTERNS.HTTPS_URL.test('https://example.com/path')).toBe(true);
      expect(VALIDATION_PATTERNS.HTTPS_URL.test('https://sub.example.com/path?query=1')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(VALIDATION_PATTERNS.HTTPS_URL.test('http://example.com')).toBe(false);
      expect(VALIDATION_PATTERNS.HTTPS_URL.test('ftp://example.com')).toBe(false);
      expect(VALIDATION_PATTERNS.HTTPS_URL.test('example.com')).toBe(false);
    });
  });

  describe('CLOUDINARY_URL', () => {
    it('should match valid Cloudinary URLs', () => {
      expect(VALIDATION_PATTERNS.CLOUDINARY_URL.test('https://res.cloudinary.com/demo/image/upload/sample.jpg')).toBe(true);
      expect(VALIDATION_PATTERNS.CLOUDINARY_URL.test('https://res.cloudinary.com/my-cloud/image/upload/v1234/folder/image.png')).toBe(true);
    });

    it('should reject non-Cloudinary URLs', () => {
      expect(VALIDATION_PATTERNS.CLOUDINARY_URL.test('https://example.com/image.jpg')).toBe(false);
      expect(VALIDATION_PATTERNS.CLOUDINARY_URL.test('https://cloudinary.com/image.jpg')).toBe(false);
    });
  });

  describe('COMPANY_NAME', () => {
    it('should match valid company names', () => {
      expect(VALIDATION_PATTERNS.COMPANY_NAME.test('Acme Inc.')).toBe(true);
      expect(VALIDATION_PATTERNS.COMPANY_NAME.test('Johnson & Johnson')).toBe(true);
      expect(VALIDATION_PATTERNS.COMPANY_NAME.test("Ben's Bakery")).toBe(true);
      expect(VALIDATION_PATTERNS.COMPANY_NAME.test('Tech Corp 2023')).toBe(true);
    });

    it('should reject invalid company names', () => {
      expect(VALIDATION_PATTERNS.COMPANY_NAME.test('<script>')).toBe(false);
      expect(VALIDATION_PATTERNS.COMPANY_NAME.test('Company@Email')).toBe(false);
    });
  });

  describe('WEBSITE_DOMAIN', () => {
    it('should match valid website domains', () => {
      expect(VALIDATION_PATTERNS.WEBSITE_DOMAIN.test('https://example.com')).toBe(true);
      expect(VALIDATION_PATTERNS.WEBSITE_DOMAIN.test('http://example.com')).toBe(true);
      expect(VALIDATION_PATTERNS.WEBSITE_DOMAIN.test('https://sub.example.co.uk')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(VALIDATION_PATTERNS.WEBSITE_DOMAIN.test('example')).toBe(false);
      expect(VALIDATION_PATTERNS.WEBSITE_DOMAIN.test('ftp://example.com')).toBe(false);
    });
  });
});
