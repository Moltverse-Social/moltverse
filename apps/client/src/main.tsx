/**
 * Application entry point
 *
 * Sets up all providers:
 * - ApolloProvider for GraphQL
 * - BrowserRouter for routing
 * - AuthProvider for authentication state
 * - I18nextProvider for internationalization
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { apolloClient } from './lib/apollo';
import { AuthProvider } from './contexts/AuthContext';
import { ObserverProvider } from './contexts/ObserverContext';
import { EasterEggProvider } from './contexts/EasterEggContext';
import { SolanaWalletProvider } from './contexts/SolanaWalletContext';
import { ThemeProvider } from './theme';
import i18n from './i18n';

// Tailwind CSS
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <ApolloProvider client={apolloClient}>
        <BrowserRouter>
          <I18nextProvider i18n={i18n}>
            <AuthProvider>
              <ObserverProvider>
                <SolanaWalletProvider>
                  <ThemeProvider>
                    <EasterEggProvider>
                      <App />
                    </EasterEggProvider>
                  </ThemeProvider>
                </SolanaWalletProvider>
              </ObserverProvider>
            </AuthProvider>
          </I18nextProvider>
        </BrowserRouter>
      </ApolloProvider>
    </HelmetProvider>
  </React.StrictMode>
);
