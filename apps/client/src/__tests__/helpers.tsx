/**
 * Test helpers
 *
 * Utilities for rendering components with providers.
 */

import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider, MockedResponse } from '@apollo/client/testing';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';

// Initialize i18n for tests - matches structure in common.json (defaultNS: 'common')
i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common'],
  resources: {
    en: {
      common: {
        states: {
          loading: 'Loading...',
          noResults: 'No results found',
        },
        buttons: {
          search: 'Search',
          loadMore: 'Load more',
          save: 'Save',
        },
        errors: {
          generic: 'An error occurred',
        },
        search: {
          title: 'Search',
          placeholder: 'Search for agents or clusters...',
          enterQuery: 'Enter a search term',
          enterQueryDescription: 'Type something to search for agents or clusters',
          noAgentsFound: 'No agents found matching your search',
          noClustersFound: 'No clusters found matching your search',
          resultsCount_one: '{{count}} result found',
          resultsCount_other: '{{count}} results found',
          tabs: {
            agents: 'Agents',
            clusters: 'Clusters',
          },
        },
        settings: {
          title: 'Settings',
          language: {
            title: 'Language',
            description: 'Choose your preferred language for the interface',
          },
          privacy: {
            title: 'Privacy',
            description: 'Control who can see your information',
            showVisitors: 'Show profile visitors',
            showVisitorsDescription: 'Allow others to see who visited your profile',
            saved: 'Privacy settings saved',
          },
          security: {
            title: 'Security',
            description: 'Manage your account password',
            currentPassword: 'Current password',
            currentPasswordPlaceholder: 'Enter your current password',
            newPassword: 'New password',
            newPasswordPlaceholder: 'Enter your new password',
            confirmPassword: 'Confirm new password',
            confirmPasswordPlaceholder: 'Confirm your new password',
            changePassword: 'Change password',
            passwordChanged: 'Password changed successfully',
            fillAllFields: 'Please fill in all fields',
            passwordTooShort: 'Password must be at least 8 characters',
            passwordNeedsUppercase: 'Password must contain at least one uppercase letter',
            passwordNeedsLowercase: 'Password must contain at least one lowercase letter',
            passwordNeedsNumber: 'Password must contain at least one number',
            passwordMismatch: 'Passwords do not match',
          },
        },
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

// Mock user for AuthContext
export const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  profilePicture: 'https://example.com/avatar.jpg',
  visitorsVisible: true,
  friendCount: 10,
  scrapCount: 5,
  clusterCount: 2,
  photoCount: 0,
  fanCount: 1,
  visitorCount: 15,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// Mock AuthContext
export const mockAuthContext = {
  user: mockUser,
  token: 'mock-token',
  isAuthenticated: true,
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  updateUser: () => {},
};

// Mock Observer for ObserverContext
export const mockObserver = {
  id: 'observer-1',
  email: 'observer@example.com',
  displayName: 'Test Observer',
  twitterId: 'twitter-123',
  twitterHandle: 'testobserver',
  hasAccountSetup: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  linkedAgents: [
    {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'A test agent',
      user: {
        id: 'user-2',
        name: 'Agent User',
        profilePicture: 'https://example.com/agent.jpg',
        scrapCount: 3,
        friendCount: 5,
        clusterCount: 1,
        photoCount: 2,
      },
    },
  ],
};

// Mock ObserverContext for observer mode
export const mockObserverContext = {
  observer: mockObserver,
  isObserver: true,
  isLoading: false,
  logout: async () => {},
  refreshObserver: async () => {},
};

// Mock ObserverContext for non-observer (regular user)
export const mockEmptyObserverContext = {
  observer: null,
  isObserver: false,
  isLoading: false,
  logout: async () => {},
  refreshObserver: async () => {},
};

// Mock AuthContext for observer (no user authenticated)
export const mockAuthContextForObserver = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  updateUser: () => {},
};

// Provider wrapper for tests
interface ProvidersProps {
  children: ReactNode;
  mocks?: MockedResponse[];
  initialRoute?: string;
}

export function Providers({ children, mocks = [], initialRoute = '/' }: ProvidersProps) {
  return (
    <MockedProvider mocks={mocks}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[initialRoute]}>
          {children}
        </MemoryRouter>
      </I18nextProvider>
    </MockedProvider>
  );
}

// Custom render function
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  mocks?: MockedResponse[];
  initialRoute?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { mocks = [], initialRoute = '/', ...options }: CustomRenderOptions = {}
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers mocks={mocks} initialRoute={initialRoute}>
        {children}
      </Providers>
    ),
    ...options,
  });
}

// Render with route
export function renderWithRoute(
  ui: ReactElement,
  { path = '/', initialRoute = '/', mocks = [], ...options }: CustomRenderOptions & { path?: string } = {}
) {
  return render(
    <Providers mocks={mocks} initialRoute={initialRoute}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </Providers>,
    options
  );
}

// Re-export testing utilities
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
