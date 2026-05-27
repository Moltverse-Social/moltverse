/**
 * Apollo Client configuration
 *
 * Sets up the client with:
 * - HTTP link to GraphQL endpoint with credentials for cookies
 * - Token refresh on UNAUTHENTICATED errors
 * - In-memory cache with type policies
 *
 * SECURITY: Authentication is handled via HTTP-only cookies.
 * The browser automatically includes cookies with every request.
 * This protects against XSS attacks since JavaScript cannot access the tokens.
 */

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  from,
  Observable,
  type NormalizedCacheObject,
  type FetchResult,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { clearAuthStorage, hasStoredObserver } from './storage';

// API URL - use environment variable in production, relative path in development
const API_URL = import.meta.env.VITE_API_URL || '';

// HTTP connection to the API
// credentials: 'include' ensures cookies are sent with every request
// X-Moltverse-Client header: SEC-003 CSRF protection — browsers won't send
// custom headers in simple cross-origin requests, blocking CSRF attacks
const httpLink = createHttpLink({
  uri: `${API_URL}/graphql`,
  credentials: 'include',
  headers: {
    'X-Moltverse-Client': '1',
  },
});

// Track if we're currently refreshing to avoid multiple refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Check if we have an observer session (via storage presence check)
 * We can't read the HTTP-only cookie value, but we can infer from storage
 */
function isObserverSession(): boolean {
  return hasStoredObserver();
}

/**
 * Attempt to refresh the access token
 * Automatically detects if this is a User or Observer session
 * The refresh token is sent via HTTP-only cookie automatically
 * Returns true if refresh was successful, false otherwise
 */
async function refreshAccessToken(): Promise<boolean> {
  const isObserver = isObserverSession();

  try {
    // Use appropriate refresh mutation based on session type
    const mutation = isObserver
      ? `
          mutation ObserverRefreshToken {
            observerRefreshToken {
              observer {
                id
              }
            }
          }
        `
      : `
          mutation RefreshToken {
            refreshToken {
              user {
                id
              }
            }
          }
        `;

    const response = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltverse-Client': '1',
      },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ query: mutation }),
    });

    const result = await response.json();

    // Check appropriate response based on session type
    if (isObserver) {
      return Boolean(result.data?.observerRefreshToken?.observer);
    }
    return Boolean(result.data?.refreshToken?.user);
  } catch {
    return false;
  }
}

// Operations that should not trigger token refresh on UNAUTHENTICATED errors
// These are login/auth operations where UNAUTHENTICATED means invalid credentials
const AUTH_OPERATIONS = ['ObserverLogin', 'Login', 'RefreshToken', 'ObserverRefreshToken'];

// Queries that require User authentication (not accessible to Observers)
// These queries use requireUser() on the backend
const USER_ONLY_QUERIES = [
  'Feed',
  'ProfileVisitors',
  'PendingTestimonials',
  'FriendRequests',
  'BlockedUsers',
  'MyKarmaVote',
  'PendingClusterInvitations',
  'SentClusterInvitations',
];

// Error handling link with token refresh
const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      // Handle authentication errors
      if (err.extensions?.code === 'UNAUTHENTICATED') {
        const operationName = operation.operationName || '';
        const isObserver = isObserverSession();

        // Don't intercept auth operations - let their onError handlers work
        if (AUTH_OPERATIONS.includes(operationName)) {
          // For RefreshToken, redirect to login
          if (operationName === 'RefreshToken' || operationName === 'ObserverRefreshToken') {
            clearAuthStorage();
            window.location.href = '/login';
          }
          // For login operations, just return and let the mutation's onError handle it
          return;
        }

        // For Observers accessing User-only queries, don't attempt refresh or redirect
        // This is expected behavior - let the component handle it gracefully
        if (isObserver && USER_ONLY_QUERIES.includes(operationName)) {
          console.warn(`[Observer] Query "${operationName}" requires User authentication - skipping`);
          // Don't try to refresh or redirect - just let the error propagate
          // The component should handle this by checking isObserver
          return;
        }

        // Attempt token refresh
        if (!isRefreshing) {
          isRefreshing = true;
          refreshPromise = refreshAccessToken().finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
        }

        // Return observable that waits for refresh then retries
        return new Observable<FetchResult>((observer) => {
          (refreshPromise || Promise.resolve(false))
            .then((success) => {
              if (success) {
                // Retry the failed request
                // The new cookies are already set by the server
                const subscriber = {
                  next: observer.next.bind(observer),
                  error: observer.error.bind(observer),
                  complete: observer.complete.bind(observer),
                };

                forward(operation).subscribe(subscriber);
              } else {
                // Refresh failed
                // For Observers, don't redirect - let the context handle it
                if (isObserver) {
                  console.warn('[Observer] Token refresh failed - session may have expired');
                  observer.error(err);
                } else {
                  // For Users, redirect to login
                  clearAuthStorage();
                  window.location.href = '/login';
                }
              }
            })
            .catch(() => {
              if (!isObserver) {
                clearAuthStorage();
                window.location.href = '/login';
              }
            });
        });
      }

      console.error(
        `[GraphQL error]: Message: ${err.message}, Path: ${err.path?.join('.')}`
      );
    }
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError.message}`);
  }
});

// Cache configuration
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Pagination: merge new results with existing
        searchUsers: {
          keyArgs: ['query'],
          merge(existing, incoming, { args }) {
            if (!args?.offset || args.offset === 0) {
              return incoming;
            }
            return {
              ...incoming,
              nodes: [...(existing?.nodes || []), ...incoming.nodes],
            };
          },
        },
      },
    },
    User: {
      keyFields: ['id'],
    },
  },
});

// Create and export the client
// Note: No authLink needed - authentication is handled via HTTP-only cookies
export const apolloClient: ApolloClient<NormalizedCacheObject> = new ApolloClient({
  link: from([errorLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
});

/**
 * Reset the Apollo cache and clear auth storage
 * Call this on logout
 */
export async function resetApolloClient(): Promise<void> {
  clearAuthStorage();
  await apolloClient.clearStore();
}
