/**
 * BrandProtectedRoute component tests
 *
 * Tests that the route wrapper correctly:
 * - Allows authenticated brands through
 * - Redirects unauthenticated users to brand login
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BrandProtectedRoute } from '../../components/auth/BrandProtectedRoute';

// Mock data
const mockBrand = {
  id: 'brand-1',
  name: 'Test Brand',
  email: 'brand@example.com',
  company: 'Test Company',
  website: 'https://example.com',
  walletAddress: null,
  createdAt: '2024-01-01T00:00:00Z',
};

// Mock hook
const mockUseBrandAuth = vi.fn();

vi.mock('../../hooks/useBrandAuth', () => ({
  useBrandAuth: () => mockUseBrandAuth(),
}));

// Helper to render with router
function renderWithRouter(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <BrandProtectedRoute>
              <div data-testid="protected-content">Protected Content</div>
            </BrandProtectedRoute>
          }
        />
        <Route path="/brands/login" element={<div data-testid="login-page">Brand Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BrandProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authenticated brand access', () => {
    it('renders protected content when brand is authenticated', () => {
      mockUseBrandAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        brand: mockBrand,
      });

      renderWithRouter('/protected');

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    });
  });

  describe('Unauthenticated access', () => {
    it('redirects to brand login when not authenticated', () => {
      mockUseBrandAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        brand: null,
      });

      renderWithRouter('/protected');

      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading while checking auth', () => {
      mockUseBrandAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        brand: null,
      });

      renderWithRouter('/protected');

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });
});
