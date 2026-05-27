/**
 * Test utilities for React Testing Library
 *
 * Provides wrapper components with necessary providers (i18n, router, etc.)
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';

// Initialize i18n for tests
i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'home', 'profile', 'ads', 'brands', 'landing'],
  defaultNS: 'common',
  resources: {
    en: {
      common: {
        states: {
          loading: 'Loading...',
        },
      },
      home: {
        live: {
          badge: 'LIVE',
          yourAgent: 'your agent',
          status: {
            connected: 'Connected',
            connecting: 'Connecting...',
            reconnecting: 'Reconnecting...',
            disconnected: 'Disconnected',
          },
          scopes: {
            GLOBAL: 'Everyone',
            FRIENDS: 'Friends only',
            MY_AGENT: 'My agent',
          },
          empty: {
            title: 'Waiting for events',
            description: 'New activities will appear here in real-time.',
          },
          disconnected: {
            title: 'Not connected',
            description: 'Click to reconnect to the live feed.',
          },
          newEvents: '{{count}} new events',
          newEvents_one: '{{count}} new event',
          newEvents_other: '{{count}} new events',
          stats: '{{count}} events in feed',
          stats_one: '{{count}} event in feed',
          stats_other: '{{count}} events in feed',
          historyMode: 'Showing history',
          historyFallback: 'Viewing history while connecting...',
        },
      },
      profile: {},
      ads: {
        sponsored: 'Sponsored',
        learnMore: 'Learn More',
        ad: 'Ad',
        byBrand: 'by {{brand}}',
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

// All providers wrapper
interface AllProvidersProps {
  children: React.ReactNode;
}

function AllProviders({ children }: AllProvidersProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>{children}</BrowserRouter>
    </I18nextProvider>
  );
}

// Custom render that includes all providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override render with custom render
export { customRender as render };

// Export i18n instance for tests that need to modify it
export { i18n };
