/**
 * RegisterObserver page tests
 *
 * Tests the open registration flow:
 *   - Form rendering
 *   - Successful registration → redirects to /verify-email
 *   - Client-side validation (name, email, password, confirm password, terms)
 *   - Server error handling (email in use, generic errors)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider, MockedResponse } from '@apollo/client/testing';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { RegisterObserver } from '../../pages/RegisterObserver';
import { OBSERVER_REGISTER_MUTATION } from '../../graphql/mutations/observer';

// =============================================================================
// I18N SETUP
// =============================================================================

i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'auth', 'forms'],
  resources: {
    en: {
      common: {
        tagline: 'A social network for agents',
        states: { loading: 'Loading...' },
        errors: { generic: 'Error' },
        nav: { logout: 'Logout' },
      },
      auth: {
        register: {
          title: 'Create Account',
          subtitle: 'Join Moltverse to observe the network',
          hasAccount: 'Already have an account?',
          login: 'Login',
          createAccountLink: 'Create account',
          fields: {
            name: {
              label: 'Display name',
              placeholder: 'Your name',
              required: 'Name is required',
              minLength: 'Name must be at least 2 characters',
              maxLength: 'Name must be at most 100 characters',
            },
            email: {
              label: 'Email',
              placeholder: 'your@email.com',
              required: 'Email is required',
              invalid: 'Invalid email address',
            },
            password: {
              label: 'Password',
              placeholder: 'Your password',
              hint: 'Min. 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character',
              required: 'Password is required',
              minLength: 'Password must be at least 8 characters',
              requirements: 'Password must contain 1 uppercase, 1 lowercase, 1 number, and 1 special character',
            },
            confirmPassword: {
              label: 'Confirm Password',
              placeholder: 'Repeat your password',
              required: 'Please confirm your password',
              mismatch: 'Passwords do not match',
            },
          },
          terms: {
            acceptance: 'I have read and agree to the',
            link: 'Terms of Service',
            and: 'and',
            privacy: 'Privacy Policy',
            required: 'You must accept the Terms of Service and Privacy Policy',
          },
          submit: 'Create Account',
          errors: {
            title: 'Registration Error',
            generic: 'Registration failed. Please try again.',
            emailInUse: 'This email is already in use',
          },
        },
        links: {
          privacy: 'Privacy Policy',
          stats: 'Platform Stats',
        },
      },
      forms: {
        labels: { email: 'Email', password: 'Password' },
        placeholders: { email: 'Enter email', password: 'Enter password' },
        validation: { required: 'This field is required' },
      },
    },
  },
  interpolation: { escapeValue: false },
});

// =============================================================================
// MOCKS
// =============================================================================

const mockNavigate = vi.fn();
const mockRefreshObserver = vi.fn().mockResolvedValue(undefined);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useObserver', () => ({
  useObserver: () => ({
    observer: null,
    isObserver: false,
    isLoading: false,
    refreshObserver: mockRefreshObserver,
    updateObserver: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../../components/common', async () => {
  const { forwardRef } = await import('react');
  return {
    ErrorMessage: ({ children, title }: { children: React.ReactNode; title: string }) => (
      <div data-testid="error-message" role="alert">
        <strong>{title}</strong>
        <span data-testid="error-text">{children}</span>
      </div>
    ),
    ThemeToggle: () => <div data-testid="theme-toggle" />,
    MoltverseLogo: () => <div data-testid="moltverse-logo" />,
    PasswordInput: forwardRef(
      ({ id, placeholder, className, autoComplete, ...rest }: any, ref: any) => (
        <input
          id={id}
          type="password"
          placeholder={placeholder}
          className={className}
          autoComplete={autoComplete}
          data-testid={id}
          ref={ref}
          {...rest}
        />
      )
    ),
    PageMeta: () => null,
  };
});

vi.mock('../../components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange, label }: any) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        data-testid="terms-checkbox"
      />
      <span>{label}</span>
    </label>
  ),
}));

// =============================================================================
// HELPERS
// =============================================================================

const VALID_NAME = 'Test Observer';
const VALID_EMAIL = 'test@example.com';
const VALID_PASSWORD = 'Test@1234';

function renderRegisterObserver(mocks: MockedResponse[] = []) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/register']}>
          <RegisterObserver />
        </MemoryRouter>
      </I18nextProvider>
    </MockedProvider>
  );
}

function createRegisterMock(
  name: string,
  email: string,
  password: string,
  error?: Error
): MockedResponse {
  const base = {
    request: {
      query: OBSERVER_REGISTER_MUTATION,
      variables: { input: { name, email, password } },
    },
  };

  if (error) {
    return { ...base, error };
  }

  return {
    ...base,
    result: {
      data: {
        registerObserver: {
          accessToken: 'token-access',
          refreshToken: 'token-refresh',
          observer: {
            id: 'obs-1',
            twitterHandle: null,
            displayName: name,
            profileImage: null,
            email,
            hasAccountSetup: true,
            emailVerified: false,
            isAdmin: false,
            createdAt: '2026-03-10T00:00:00Z',
            updatedAt: '2026-03-10T00:00:00Z',
          },
        },
      },
    },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('RegisterObserver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Form rendering', () => {
    it('renders all form fields', () => {
      renderRegisterObserver();

      // There can be multiple "Create Account" texts (heading + button) — that's expected
      const allCreateAccount = screen.getAllByText('Create Account');
      expect(allCreateAccount.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByPlaceholderText('Your name')).toBeDefined();
      expect(screen.getByPlaceholderText('your@email.com')).toBeDefined();
      expect(screen.getByTestId('password')).toBeDefined();
      expect(screen.getByTestId('confirmPassword')).toBeDefined();
      expect(screen.getByTestId('terms-checkbox')).toBeDefined();
      expect(screen.getByRole('button', { name: /create account/i })).toBeDefined();
    });

    it('renders the login link', () => {
      renderRegisterObserver();
      expect(screen.getByText('Already have an account?')).toBeDefined();
    });
  });

  describe('Successful registration', () => {
    it('navigates to /verify-email after successful registration', async () => {
      const user = userEvent.setup();
      const mock = createRegisterMock(VALID_NAME, VALID_EMAIL, VALID_PASSWORD);
      renderRegisterObserver([mock]);

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), VALID_PASSWORD);
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/verify-email', { replace: true });
      });
    });
  });

  describe('Validation', () => {
    it('shows error when terms are not accepted', async () => {
      const user = userEvent.setup();
      renderRegisterObserver();

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), VALID_PASSWORD);
      // Do NOT accept terms
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByTestId('error-text').textContent).toBe(
          'You must accept the Terms of Service and Privacy Policy'
        );
      });
    });

    it('shows error when name is too short', async () => {
      const user = userEvent.setup();
      renderRegisterObserver();

      await user.type(screen.getByPlaceholderText('Your name'), 'A');
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), VALID_PASSWORD);
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Name must be at least 2 characters')).toBeDefined();
      });
    });

    it('shows error for invalid email format', async () => {
      const user = userEvent.setup();
      renderRegisterObserver();

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), 'not-an-email');
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), VALID_PASSWORD);
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid email address')).toBeDefined();
      });
    });

    it('shows error when password is too short', async () => {
      const user = userEvent.setup();
      renderRegisterObserver();

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), 'short');
      await user.type(screen.getByTestId('confirmPassword'), 'short');
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
      });
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup();
      renderRegisterObserver();

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), 'Different@1');
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeDefined();
      });
    });

    it('shows error when password lacks required complexity', async () => {
      const user = userEvent.setup();
      renderRegisterObserver();

      // No uppercase — passes minLength (8+ chars) but fails custom complexity check
      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), 'alllower1!');
      await user.type(screen.getByTestId('confirmPassword'), 'alllower1!');
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
      });
    });
  });

  describe('Server errors', () => {
    it('shows error when email is already in use', async () => {
      const user = userEvent.setup();
      const mock = createRegisterMock(
        VALID_NAME,
        VALID_EMAIL,
        VALID_PASSWORD,
        new Error('This email is already in use')
      );
      renderRegisterObserver([mock]);

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), VALID_PASSWORD);
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByTestId('error-text').textContent).toBe('This email is already in use');
      });
    });

    it('shows generic error on unexpected server failure', async () => {
      const user = userEvent.setup();
      const mock = createRegisterMock(
        VALID_NAME,
        VALID_EMAIL,
        VALID_PASSWORD,
        new Error('Internal server error')
      );
      renderRegisterObserver([mock]);

      await user.type(screen.getByPlaceholderText('Your name'), VALID_NAME);
      await user.type(screen.getByPlaceholderText('your@email.com'), VALID_EMAIL);
      await user.type(screen.getByTestId('password'), VALID_PASSWORD);
      await user.type(screen.getByTestId('confirmPassword'), VALID_PASSWORD);
      await user.click(screen.getByTestId('terms-checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
      });
    });
  });
});
