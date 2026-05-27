/**
 * useAdTracking Hook Tests
 *
 * Tests for:
 * - Impression tracking (success, failure, network error)
 * - Click tracking (success, failure, network error)
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdTracking } from '../../hooks/useAdTracking';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock ad-logger to avoid console noise
vi.mock('../../lib/ad-logger', () => ({
  adLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useAdTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // IMPRESSION TRACKING TESTS
  // ============================================================================

  describe('trackImpression', () => {
    it('returns impression ID on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ impressionId: 'impression-123' }),
      });

      const { result } = renderHook(() => useAdTracking());

      let impressionId: string | null = null;
      await act(async () => {
        impressionId = await result.current.trackImpression('campaign-456');
      });

      expect(impressionId).toBe('impression-123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ads/impression'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ campaignId: 'campaign-456' }),
        })
      );
    });

    it('returns null on 404 (campaign unavailable)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useAdTracking());

      let impressionId: string | null = 'should-be-null';
      await act(async () => {
        impressionId = await result.current.trackImpression('campaign-456');
      });

      expect(impressionId).toBeNull();
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useAdTracking());

      let impressionId: string | null = 'should-be-null';
      await act(async () => {
        impressionId = await result.current.trackImpression('campaign-456');
      });

      expect(impressionId).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAdTracking());

      let impressionId: string | null = 'should-be-null';
      await act(async () => {
        impressionId = await result.current.trackImpression('campaign-456');
      });

      expect(impressionId).toBeNull();
    });

    it('sets isTrackingImpression during request', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useAdTracking());

      expect(result.current.isTrackingImpression).toBe(false);

      // Start tracking
      let trackPromise: Promise<string | null>;
      act(() => {
        trackPromise = result.current.trackImpression('campaign-456');
      });

      // Should be tracking now
      await waitFor(() => {
        expect(result.current.isTrackingImpression).toBe(true);
      });

      // Resolve the request
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ impressionId: 'impression-123' }),
        });
        await trackPromise;
      });

      // Should stop tracking
      expect(result.current.isTrackingImpression).toBe(false);
    });
  });

  // ============================================================================
  // CLICK TRACKING TESTS
  // ============================================================================

  describe('trackClick', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAdTracking());

      let success = false;
      await act(async () => {
        success = await result.current.trackClick('impression-123');
      });

      expect(success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ads/click'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ impressionId: 'impression-123' }),
        })
      );
    });

    it('returns false on 404 (impression unavailable)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useAdTracking());

      let success = true;
      await act(async () => {
        success = await result.current.trackClick('impression-123');
      });

      expect(success).toBe(false);
    });

    it('returns false on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useAdTracking());

      let success = true;
      await act(async () => {
        success = await result.current.trackClick('impression-123');
      });

      expect(success).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAdTracking());

      let success = true;
      await act(async () => {
        success = await result.current.trackClick('impression-123');
      });

      expect(success).toBe(false);
    });

    it('sets isTrackingClick during request', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useAdTracking());

      expect(result.current.isTrackingClick).toBe(false);

      // Start tracking
      let trackPromise: Promise<boolean>;
      act(() => {
        trackPromise = result.current.trackClick('impression-123');
      });

      // Should be tracking now
      await waitFor(() => {
        expect(result.current.isTrackingClick).toBe(true);
      });

      // Resolve the request
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
        await trackPromise;
      });

      // Should stop tracking
      expect(result.current.isTrackingClick).toBe(false);
    });
  });

  // ============================================================================
  // MULTIPLE CALLS TESTS
  // ============================================================================

  describe('multiple calls', () => {
    it('can track impression and then click', async () => {
      // Mock impression call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ impressionId: 'impression-123' }),
      });

      // Mock click call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useAdTracking());

      // Track impression
      let impressionId: string | null = null;
      await act(async () => {
        impressionId = await result.current.trackImpression('campaign-456');
      });

      expect(impressionId).toBe('impression-123');

      // Track click
      let success = false;
      await act(async () => {
        success = await result.current.trackClick(impressionId!);
      });

      expect(success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
