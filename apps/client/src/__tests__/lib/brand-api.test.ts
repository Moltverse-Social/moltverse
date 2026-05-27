/**
 * Brand API client tests
 *
 * Tests the REST API client for brand authentication and campaign management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  brandRegister,
  brandLogin,
  brandRefresh,
  brandGetMe,
  brandLogout,
  campaignList,
  campaignGet,
  campaignCreate,
  campaignUpdate,
  campaignDelete,
  campaignSubmit,
  campaignPause,
  campaignResume,
  campaignGetStats,
  BrandApiClientError,
} from '../../lib/brand-api';

// Setup global fetch mock
// Note: Storage is no longer mocked because auth now uses HTTP-only cookies
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('brand-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // AUTH ENDPOINTS
  // ==========================================================================

  describe('brandRegister', () => {
    it('should register a new brand successfully', async () => {
      // Response no longer includes tokens (they are set via HTTP-only cookies)
      const mockResponse = {
        brand: {
          id: 'brand-1',
          name: 'Test Brand',
          email: 'test@example.com',
          company: 'Test Co',
          website: null,
          walletAddress: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await brandRegister({
        name: 'Test Brand',
        email: 'test@example.com',
        password: 'Password123!',
        company: 'Test Co',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/brands/register'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Required for cookie-based auth
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw BrandApiClientError on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Email already exists',
          code: 'EMAIL_EXISTS',
        }),
      });

      await expect(
        brandRegister({
          name: 'Test',
          email: 'existing@example.com',
          password: 'Password123!',
          company: 'Test Co',
        })
      ).rejects.toThrow(BrandApiClientError);
    });
  });

  describe('brandLogin', () => {
    it('should login successfully', async () => {
      // Response no longer includes tokens (they are set via HTTP-only cookies)
      const mockResponse = {
        brand: {
          id: 'brand-1',
          name: 'Test Brand',
          email: 'test@example.com',
          company: 'Test Co',
          website: null,
          walletAddress: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await brandLogin('test@example.com', 'Password123!');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/brands/login'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Required for cookie-based auth
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        }),
      });

      await expect(
        brandLogin('test@example.com', 'wrong-password')
      ).rejects.toThrow(BrandApiClientError);
    });
  });

  describe('brandRefresh', () => {
    it('should refresh tokens successfully', async () => {
      // Response is now { success: true }, tokens set via HTTP-only cookies
      const mockResponse = { success: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await brandRefresh();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/brands/refresh'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include', // Sends refresh token cookie
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return null on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await brandRefresh();

      expect(result).toBeNull();
    });
  });

  describe('brandGetMe', () => {
    it('should return brand profile', async () => {
      const mockBrand = {
        id: 'brand-1',
        name: 'Test Brand',
        email: 'test@example.com',
        company: 'Test Co',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ brand: mockBrand }),
      });

      const result = await brandGetMe();

      // Now uses cookies instead of Authorization header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/brands/me'),
        expect.objectContaining({
          credentials: 'include', // Sends access token cookie
        })
      );
      expect(result?.brand).toEqual(mockBrand);
    });

    it('should return null on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await brandGetMe();

      expect(result).toBeNull();
    });
  });

  describe('brandLogout', () => {
    it('should call logout endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await brandLogout();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/brands/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include', // Sends refresh token cookie for revocation
        })
      );
    });

    it('should not throw on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(brandLogout()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // CAMPAIGN ENDPOINTS
  // ==========================================================================

  describe('campaignList', () => {
    it('should return campaign list', async () => {
      const mockResponse = {
        campaigns: [
          { id: 'campaign-1', headline: 'Campaign 1' },
          { id: 'campaign-2', headline: 'Campaign 2' },
        ],
        total: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await campaignList();

      expect(result.campaigns).toHaveLength(2);
    });

    it('should include query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaigns: [], total: 0 }),
      });

      await campaignList({ status: 'ACTIVE', limit: 10, offset: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=ACTIVE'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=5'),
        expect.anything()
      );
    });
  });

  describe('campaignGet', () => {
    it('should return campaign by ID', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        headline: 'Test Campaign',
        status: 'DRAFT',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaign: mockCampaign }),
      });

      const result = await campaignGet('campaign-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1'),
        expect.anything()
      );
      expect(result.campaign.id).toBe('campaign-1');
    });

    it('should throw on not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: 'Campaign not found',
          code: 'NOT_FOUND',
        }),
      });

      await expect(campaignGet('nonexistent')).rejects.toThrow(BrandApiClientError);
    });
  });

  describe('campaignCreate', () => {
    it('should create campaign', async () => {
      const input = {
        headline: 'New Campaign',
        description: 'Campaign description',
        linkUrl: 'https://example.com',
        bidAmount: 100,
        budgetTotal: 5000,
      };

      const mockResponse = {
        campaign: {
          id: 'campaign-new',
          ...input,
          status: 'DRAFT',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await campaignCreate(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.campaign.status).toBe('DRAFT');
    });
  });

  describe('campaignUpdate', () => {
    it('should update campaign', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          campaign: { id: 'campaign-1', headline: 'Updated' },
        }),
      });

      const result = await campaignUpdate('campaign-1', { headline: 'Updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
      expect(result.campaign.headline).toBe('Updated');
    });

    it('should throw on invalid status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Only DRAFT campaigns can be edited',
          code: 'INVALID_STATUS',
        }),
      });

      await expect(
        campaignUpdate('campaign-1', { headline: 'Updated' })
      ).rejects.toThrow(BrandApiClientError);
    });
  });

  describe('campaignDelete', () => {
    it('should delete campaign', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await campaignDelete('campaign-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('campaignSubmit', () => {
    it('should submit campaign for review', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          campaign: { id: 'campaign-1', status: 'PENDING_REVIEW' },
        }),
      });

      const result = await campaignSubmit('campaign-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1/submit'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.campaign.status).toBe('PENDING_REVIEW');
    });
  });

  describe('campaignPause', () => {
    it('should pause active campaign', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          campaign: { id: 'campaign-1', status: 'PAUSED' },
        }),
      });

      const result = await campaignPause('campaign-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1/pause'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.campaign.status).toBe('PAUSED');
    });
  });

  describe('campaignResume', () => {
    it('should resume paused campaign', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          campaign: { id: 'campaign-1', status: 'ACTIVE' },
        }),
      });

      const result = await campaignResume('campaign-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1/resume'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.campaign.status).toBe('ACTIVE');
    });
  });

  describe('campaignGetStats', () => {
    it('should return campaign statistics', async () => {
      const mockStats = {
        id: 'campaign-1',
        impressions: 1000,
        clicks: 50,
        ctr: 5.0,
        budgetTotal: 10000,
        budgetSpent: 2500,
        budgetRemaining: 7500,
        budgetUtilization: 25.0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      });

      const result = await campaignGetStats('campaign-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/campaign-1/stats'),
        expect.anything()
      );
      expect(result.impressions).toBe(1000);
      expect(result.ctr).toBe(5.0);
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('BrandApiClientError', () => {
    it('should include error details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: 'Password too weak',
          field: 'password',
        }),
      });

      try {
        await brandRegister({
          name: 'Test',
          email: 'test@example.com',
          password: 'weak',
          company: 'Test Co',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(BrandApiClientError);
        const apiError = error as BrandApiClientError;
        expect(apiError.code).toBe('VALIDATION_ERROR');
        expect(apiError.details).toBe('Password too weak');
        expect(apiError.field).toBe('password');
        expect(apiError.status).toBe(422);
      }
    });

    it('should handle unparseable error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      try {
        await brandLogin('test@example.com', 'password');
      } catch (error) {
        expect(error).toBeInstanceOf(BrandApiClientError);
        const apiError = error as BrandApiClientError;
        expect(apiError.code).toBe('UNKNOWN_ERROR');
        expect(apiError.status).toBe(500);
      }
    });
  });
});
