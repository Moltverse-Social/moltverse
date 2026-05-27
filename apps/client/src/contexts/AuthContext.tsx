/**
 * Authentication Context
 *
 * Provides authentication state and methods to the entire app.
 * Handles login, registration, logout, and session persistence.
 *
 * SECURITY: Authentication tokens are stored in HTTP-only cookies,
 * which cannot be accessed by JavaScript. This protects against XSS attacks.
 * The browser automatically sends cookies with every request.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useMutation, useLazyQuery } from '@apollo/client';
import type {
  User,
  AuthContextValue,
  LoginMutationData,
  CreateUserMutationData,
  MeQueryData,
} from '../types';
import { LOGIN_MUTATION, CREATE_USER_MUTATION, LOGOUT_MUTATION } from '../graphql/mutations';
import { ME_MINIMAL_QUERY } from '../graphql/queries';
import {
  getStoredUser,
  setStoredUser,
  clearAuthStorage,
} from '../lib/storage';
import { resetApolloClient } from '../lib/apollo';
import { createLogger } from '../lib/logger';

const log = createLogger('AuthContext');

// Context with undefined default (must be used within provider)
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // State
  // We store user data locally for quick rendering, but authentication
  // is verified by the server via cookies on every API request
  const [user, setUser] = useState<User | null>(() => getStoredUser<User>());
  const [isLoading, setIsLoading] = useState(true);

  // GraphQL operations
  const [loginMutation] = useMutation<LoginMutationData>(LOGIN_MUTATION);
  const [createUserMutation] = useMutation<CreateUserMutationData>(CREATE_USER_MUTATION);
  const [logoutMutation] = useMutation(LOGOUT_MUTATION);
  const [fetchMe] = useLazyQuery<MeQueryData>(ME_MINIMAL_QUERY, {
    fetchPolicy: 'network-only',
  });

  // Computed - user is authenticated if we have user data and the server accepts our cookie
  const isAuthenticated = Boolean(user);

  /**
   * Verify authentication on mount by checking with the server
   * The server will validate our HTTP-only cookie
   */
  useEffect(() => {
    const verifyAuth = async () => {
      log.debug('verifyAuth starting');
      try {
        const { data, error } = await fetchMe();
        log.debug('fetchMe result', {
          hasData: !!data,
          hasMe: !!data?.me,
          userId: data?.me?.id,
          error: error?.message,
        });

        if (error || !data?.me) {
          // Server rejected our cookie or we don't have one
          log.debug('auth failed, clearing user');
          clearAuthStorage();
          setUser(null);
        } else {
          // Server accepted our cookie — update cached user data
          log.debug('auth success, setting user', data.me.id);
          setUser(data.me);
          setStoredUser(data.me);
        }
      } catch (err) {
        log.warn('verifyAuth error', err);
        clearAuthStorage();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    verifyAuth();
  }, [fetchMe]);

  /**
   * Login with email and password
   * The server will set HTTP-only cookies in the response
   */
  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const { data, errors } = await loginMutation({
        variables: {
          input: { email, password },
        },
      });

      if (errors?.length) {
        throw new Error(errors[0].message);
      }

      if (!data?.login) {
        throw new Error('Login failed');
      }

      // The server has set the HTTP-only cookies
      // We just need to update our local user state
      const { user: newUser } = data.login;
      setUser(newUser);
      setStoredUser(newUser);
    },
    [loginMutation]
  );

  /**
   * Register a new account
   * The server will set HTTP-only cookies in the response
   */
  const register = useCallback(
    async (name: string, email: string, password: string): Promise<void> => {
      const { data, errors } = await createUserMutation({
        variables: {
          input: { name, email, password },
        },
      });

      if (errors?.length) {
        throw new Error(errors[0].message);
      }

      if (!data?.createUser) {
        throw new Error('Registration failed');
      }

      // The server has set the HTTP-only cookies
      // We just need to update our local user state
      const { user: newUser } = data.createUser;
      setUser(newUser);
      setStoredUser(newUser);
    },
    [createUserMutation]
  );

  /**
   * Logout and clear session
   * The server will clear HTTP-only cookies in the response
   */
  const logout = useCallback(async () => {
    try {
      // Tell server to revoke refresh token and clear cookies
      // No need to pass refreshToken - server will use the HTTP-only cookie
      await logoutMutation();
    } catch {
      // Ignore errors - we're logging out anyway
    }

    // Clear local state
    setUser(null);
    await resetApolloClient();
  }, [logoutMutation]);

  /**
   * Update user data (after profile edit, etc.)
   */
  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    setStoredUser(updatedUser);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      token: null, // Token is no longer accessible - stored in HTTP-only cookie
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
      updateUser,
    }),
    [user, isAuthenticated, isLoading, login, register, logout, updateUser]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
