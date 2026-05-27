/**
 * useBrandAuth hook tests
 *
 * Tests that the hook correctly exposes the BrandAuthContext values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { useBrandAuth } from '../../hooks/useBrandAuth';
import { BrandAuthContext } from '../../contexts/BrandAuthContext';
import type { BrandAuthContextValue } from '../../types';

// Mock brand data
const mockBrand = {
  id: 'brand-1',
  name: 'Test Brand',
  email: 'test@example.com',
  company: 'Test Company',
  website: 'https://example.com',
  walletAddress: null,
  createdAt: '2024-01-01T00:00:00Z',
};

// Create mock context value
function createMockContextValue(overrides?: Partial<BrandAuthContextValue>): BrandAuthContextValue {
  return {
    brand: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshAuth: vi.fn(),
    updateBrand: vi.fn(),
    ...overrides,
  };
}

// Helper to create wrapper with context
function createWrapper(contextValue: BrandAuthContextValue) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrandAuthContext.Provider value={contextValue}>
        {children}
      </BrandAuthContext.Provider>
    );
  };
}

describe('useBrandAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useBrandAuth());
    }).toThrow('useBrandAuth must be used within a BrandAuthProvider');

    consoleSpy.mockRestore();
  });

  it('should return context values when authenticated', () => {
    const contextValue = createMockContextValue({
      brand: mockBrand,
      isAuthenticated: true,
      isLoading: false,
    });

    const { result } = renderHook(() => useBrandAuth(), {
      wrapper: createWrapper(contextValue),
    });

    expect(result.current.brand).toEqual(mockBrand);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('should return context values when not authenticated', () => {
    const contextValue = createMockContextValue({
      brand: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useBrandAuth(), {
      wrapper: createWrapper(contextValue),
    });

    expect(result.current.brand).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should return loading state', () => {
    const contextValue = createMockContextValue({
      isLoading: true,
    });

    const { result } = renderHook(() => useBrandAuth(), {
      wrapper: createWrapper(contextValue),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('should expose auth functions', () => {
    const mockLogin = vi.fn();
    const mockRegister = vi.fn();
    const mockLogout = vi.fn();
    const mockRefreshAuth = vi.fn();
    const mockUpdateBrand = vi.fn();

    const contextValue = createMockContextValue({
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
      refreshAuth: mockRefreshAuth,
      updateBrand: mockUpdateBrand,
    });

    const { result } = renderHook(() => useBrandAuth(), {
      wrapper: createWrapper(contextValue),
    });

    expect(result.current.login).toBe(mockLogin);
    expect(result.current.register).toBe(mockRegister);
    expect(result.current.logout).toBe(mockLogout);
    expect(result.current.refreshAuth).toBe(mockRefreshAuth);
    expect(result.current.updateBrand).toBe(mockUpdateBrand);
  });
});
