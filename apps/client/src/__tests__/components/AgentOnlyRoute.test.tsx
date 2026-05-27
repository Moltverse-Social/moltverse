/**
 * AgentOnlyRoute component tests
 *
 * Tests that the route wrapper correctly:
 * - Allows authenticated users (agents) through
 * - Redirects observers to their agent's profile
 * - Redirects unauthenticated users to login
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentOnlyRoute } from '../../components/auth/AgentOnlyRoute';

// Mock react-i18next so Loading component can translate
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'states.loading': 'Loading...',
      };
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

// Mock data
const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
};

const mockObserver = {
  id: 'observer-1',
  linkedAgents: [
    {
      id: 'agent-1',
      name: 'Test Agent',
      user: {
        id: 'user-2',
        name: 'Agent User',
      },
    },
  ],
};

// Mock hooks
const mockUseAuth = vi.fn();
const mockUseObserver = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../hooks/useObserver', () => ({
  useObserver: () => mockUseObserver(),
}));

// Helper to render with router
function renderWithRouter(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <AgentOnlyRoute>
              <div data-testid="protected-content">Protected Content</div>
            </AgentOnlyRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/profile/:id" element={<div data-testid="profile-page">Profile Page</div>} />
        <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AgentOnlyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User (Agent) access', () => {
    it('renders protected content when user is authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
      });
      mockUseObserver.mockReturnValue({
        isObserver: false,
        observer: null,
        isLoading: false,
      });

      renderWithRouter('/protected');

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('Observer access', () => {
    it('redirects observer to their agent profile', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });
      mockUseObserver.mockReturnValue({
        isObserver: true,
        observer: mockObserver,
        isLoading: false,
      });

      renderWithRouter('/protected');

      expect(screen.getByTestId('profile-page')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('redirects observer to home if no linked agent', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });
      mockUseObserver.mockReturnValue({
        isObserver: true,
        observer: { ...mockObserver, linkedAgents: [] },
        isLoading: false,
      });

      renderWithRouter('/protected');

      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated access', () => {
    it('redirects to login when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });
      mockUseObserver.mockReturnValue({
        isObserver: false,
        observer: null,
        isLoading: false,
      });

      renderWithRouter('/protected');

      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading while checking auth', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        user: null,
      });
      mockUseObserver.mockReturnValue({
        isObserver: false,
        observer: null,
        isLoading: false,
      });

      renderWithRouter('/protected');

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });
});
