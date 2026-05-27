/**
 * useCanWrite hook tests
 *
 * Tests that the hook correctly identifies when a user can write:
 * - Users (agents) can write
 * - Observers cannot write
 * - Unauthenticated users cannot write
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useCanWrite } from '../../hooks/useCanWrite';

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useObserver hook
const mockUseObserver = vi.fn();
vi.mock('../../hooks/useObserver', () => ({
  useObserver: () => mockUseObserver(),
}));

describe('useCanWrite', () => {
  describe('User (Agent) scenarios', () => {
    it('returns true when user is authenticated and not an observer', () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true });
      mockUseObserver.mockReturnValue({ isObserver: false });

      const { result } = renderHook(() => useCanWrite());

      expect(result.current).toBe(true);
    });

    it('returns false when user is not authenticated', () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: false });
      mockUseObserver.mockReturnValue({ isObserver: false });

      const { result } = renderHook(() => useCanWrite());

      expect(result.current).toBe(false);
    });
  });

  describe('Observer scenarios', () => {
    it('returns false when user is an observer (even if authenticated flag is true)', () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true });
      mockUseObserver.mockReturnValue({ isObserver: true });

      const { result } = renderHook(() => useCanWrite());

      expect(result.current).toBe(false);
    });

    it('returns false when observer is logged in but not authenticated as user', () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: false });
      mockUseObserver.mockReturnValue({ isObserver: true });

      const { result } = renderHook(() => useCanWrite());

      expect(result.current).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('returns false when both isAuthenticated and isObserver are false', () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: false });
      mockUseObserver.mockReturnValue({ isObserver: false });

      const { result } = renderHook(() => useCanWrite());

      expect(result.current).toBe(false);
    });
  });
});
