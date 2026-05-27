/**
 * SetupAccount page tests
 *
 * Tests the two-phase flow:
 *   Phase 1 (setup): Email/password form with validation
 *   Phase 2 (verify): 8-digit verification code input
 *   Phase 3 (success): Confirmation message before redirect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider, MockedResponse } from '@apollo/client/testing';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { SetupAccount } from '../../pages/SetupAccount';
import {
  SETUP_OBSERVER_ACCOUNT_MUTATION,
  VERIFY_EMAIL_MUTATION,
  SEND_EMAIL_VERIFICATION_MUTATION,
} from '../../graphql/mutations/observer';

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
        errors: { generic: 'Error', error: 'Error' },
      },
      auth: {
        claim: {
          agentVerified: 'Agent Verified!',
          setupAccountTitle: 'Set up your login to access your agent anytime.',
          confirmPassword: 'Confirm Password',
          confirmPasswordPlaceholder: 'Confirm your password',
          passwordHint: 'Min. 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character',
          createAccount: 'Create Account',
          passwordMinLength: 'Password must be at least 8 characters',
          passwordMismatch: 'Passwords do not match',
          passwordRequirements: 'Password must contain 1 uppercase, 1 lowercase, 1 number, and 1 special character',
          termsAcceptance: 'I have read and agree to the',
          termsLink: 'Terms of Service',
          and: 'and',
          privacyLink: 'Privacy Policy',
          termsRequired: 'You must accept the Terms of Service and Privacy Policy',
        },
        verification: {
          title: 'Verify Your Email',
          description: 'We sent an 8-digit code to {{email}}',
          enterFullCode: 'Please enter the complete 8-digit code',
          expiresIn: 'Code expires in 15 minutes',
          verify: 'Verify Email',
          didntReceive: "Didn't receive the code?",
          resendCode: 'Resend code',
          resendIn: 'Resend in {{seconds}}s',
          success: 'Email Verified!',
          redirecting: 'Redirecting to home...',
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

const mockRefreshObserver = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/useObserver', () => ({
  useObserver: () => ({
    observer: {
      id: 'obs-1',
      hasAccountSetup: false,
      emailVerified: false,
      displayName: 'Test Observer',
    },
    isObserver: true,
    isLoading: false,
    refreshObserver: mockRefreshObserver,
    updateObserver: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

// Mock components that depend on providers not available in test context
vi.mock('../../components/common', () => ({
  ErrorMessage: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="error-message" role="alert">
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  ),
  ThemeToggle: () => <div data-testid="theme-toggle" />,
  MoltverseLogo: ({ size, className }: { size: number; className?: string }) => (
    <div data-testid="moltverse-logo" data-size={size} className={className} />
  ),
  PasswordInput: vi.fn().mockImplementation(
    ({ id, placeholder, value, onChange, autoComplete, className, ...rest }: any) => (
      <input
        id={id}
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={className}
        aria-label={id === 'password' ? 'Password' : 'Confirm Password'}
        {...rest}
      />
    )
  ),
  PageMeta: () => null,
}));

// =============================================================================
// HELPERS
// =============================================================================

function renderSetupAccount(mocks: MockedResponse[] = []) {
  return render(
    <MockedProvider mocks={mocks}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/setup-account']}>
          <SetupAccount />
        </MemoryRouter>
      </I18nextProvider>
    </MockedProvider>
  );
}

function createSetupMock(
  email: string,
  password: string,
  error?: Error
): MockedResponse {
  const base = {
    request: {
      query: SETUP_OBSERVER_ACCOUNT_MUTATION,
      variables: { input: { email, password } },
    },
  };

  if (error) {
    return { ...base, error };
  }

  return {
    ...base,
    result: {
      data: {
        setupObserverAccount: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          observer: {
            __typename: 'HumanObserver',
            id: 'obs-1',
            twitterHandle: 'testuser',
            displayName: 'Test Observer',
            profileImage: null,
            email,
            hasAccountSetup: true,
            emailVerified: false,
            isAdmin: false,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      },
    },
  };
}

function createVerifyMock(code: string, error?: Error): MockedResponse {
  const base = {
    request: {
      query: VERIFY_EMAIL_MUTATION,
      variables: { code },
    },
  };

  if (error) {
    return { ...base, error };
  }

  return {
    ...base,
    result: { data: { verifyEmail: true } },
  };
}

function createResendMock(error?: Error): MockedResponse {
  const base = {
    request: {
      query: SEND_EMAIL_VERIFICATION_MUTATION,
    },
  };

  if (error) {
    return { ...base, error };
  }

  return {
    ...base,
    result: { data: { sendEmailVerification: true } },
  };
}

// Valid password that meets all requirements
const VALID_PASSWORD = 'Test1234!';
const VALID_EMAIL = 'test@example.com';

// =============================================================================
// TESTS
// =============================================================================

describe('SetupAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // PHASE 1: SETUP FORM RENDERING
  // ---------------------------------------------------------------------------

  describe('Setup phase rendering', () => {
    it('renders the setup form with all fields', () => {
      renderSetupAccount();

      expect(screen.getByText('Agent Verified!')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    });

    it('renders terms and privacy links', () => {
      renderSetupAccount();

      expect(screen.getByText('Terms of Service')).toBeInTheDocument();
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });

    it('does not render verification UI initially', () => {
      renderSetupAccount();

      expect(screen.queryByText('Verify Your Email')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // PHASE 1: FORM VALIDATION
  // ---------------------------------------------------------------------------

  describe('Setup phase validation', () => {
    it('shows error when terms not accepted', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSetupAccount();

      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('You must accept the Terms of Service and Privacy Policy')).toBeInTheDocument();
    });

    it('shows error when email is empty', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSetupAccount();

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('shows error when password is too short', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSetupAccount();

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), 'Short1!');
      await user.type(screen.getByLabelText('Confirm Password'), 'Short1!');

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSetupAccount();

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), 'Different1!');

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('shows error when password missing special character', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderSetupAccount();

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), 'NoSpecial1');
      await user.type(screen.getByLabelText('Confirm Password'), 'NoSpecial1');

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Password must contain 1 uppercase, 1 lowercase, 1 number, and 1 special character')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // PHASE TRANSITION: SETUP → VERIFY
  // ---------------------------------------------------------------------------

  describe('Setup to verify transition', () => {
    it('transitions to verify phase after successful setup', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const mock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);

      renderSetupAccount([mock]);

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      expect(screen.getByText(`We sent an 8-digit code to ${VALID_EMAIL}`)).toBeInTheDocument();
    });

    it('does not call refreshObserver after setup mutation', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const mock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);

      renderSetupAccount([mock]);

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      expect(mockRefreshObserver).not.toHaveBeenCalled();
    });

    it('shows setup error on mutation failure', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const mock = createSetupMock(VALID_EMAIL, VALID_PASSWORD, new Error('Email already in use'));

      renderSetupAccount([mock]);

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
      });

      // Should still be on setup phase
      expect(screen.getByText('Agent Verified!')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // PHASE 2: VERIFICATION CODE INPUT
  // ---------------------------------------------------------------------------

  describe('Verify phase rendering', () => {
    async function goToVerifyPhase(extraMocks: MockedResponse[] = []) {
      const setupMock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderSetupAccount([setupMock, ...extraMocks]);

      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      return user;
    }

    it('renders 8 code input fields', async () => {
      await goToVerifyPhase();

      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(8);
    });

    it('renders verify button and resend link', async () => {
      await goToVerifyPhase();

      expect(screen.getByRole('button', { name: 'Verify Email' })).toBeInTheDocument();
      expect(screen.getByText("Didn't receive the code?")).toBeInTheDocument();
      expect(screen.getByText('Resend code')).toBeInTheDocument();
    });

    it('shows expiry information', async () => {
      await goToVerifyPhase();

      expect(screen.getByText('Code expires in 15 minutes')).toBeInTheDocument();
    });

    it('verify button is disabled until 8 digits entered', async () => {
      await goToVerifyPhase();

      const verifyButton = screen.getByRole('button', { name: 'Verify Email' });
      expect(verifyButton).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // PHASE TRANSITION: VERIFY → SUCCESS
  // ---------------------------------------------------------------------------

  describe('Verify to success transition', () => {
    it('shows success message after verification', async () => {
      const setupMock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);
      const verifyMock = createVerifyMock('12345678');
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderSetupAccount([setupMock, verifyMock]);

      // Go through setup
      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      // Paste code to trigger auto-submit
      const inputs = screen.getAllByRole('textbox');
      await user.click(inputs[0]);
      await user.paste('12345678');

      await waitFor(() => {
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
        expect(screen.getByText('Redirecting to home...')).toBeInTheDocument();
      });
    });

    it('calls refreshObserver after 2 second delay', async () => {
      const setupMock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);
      const verifyMock = createVerifyMock('12345678');
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderSetupAccount([setupMock, verifyMock]);

      // Go through setup
      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      // Paste code
      const inputs = screen.getAllByRole('textbox');
      await user.click(inputs[0]);
      await user.paste('12345678');

      await waitFor(() => {
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
      });

      // refreshObserver should NOT be called yet
      expect(mockRefreshObserver).not.toHaveBeenCalled();

      // Advance 2 seconds
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(mockRefreshObserver).toHaveBeenCalledTimes(1);
    });

    it('clears code and resets guard on verification error', async () => {
      const setupMock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);
      const verifyErrorMock = createVerifyMock('12345678', new Error('Invalid code'));
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderSetupAccount([setupMock, verifyErrorMock]);

      // Go through setup
      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      // Paste code
      const inputs = screen.getAllByRole('textbox');
      await user.click(inputs[0]);
      await user.paste('12345678');

      // Should show error
      await waitFor(() => {
        expect(screen.getByText('Invalid code')).toBeInTheDocument();
      });

      // Should still be on verify phase
      expect(screen.getByText('Verify Your Email')).toBeInTheDocument();

      // Inputs should be cleared
      await waitFor(() => {
        const updatedInputs = screen.getAllByRole('textbox');
        expect((updatedInputs[0] as HTMLInputElement).value).toBe('');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // RESEND FUNCTIONALITY
  // ---------------------------------------------------------------------------

  describe('Resend code', () => {
    it('starts cooldown after resend', async () => {
      const setupMock = createSetupMock(VALID_EMAIL, VALID_PASSWORD);
      const resendMock = createResendMock();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderSetupAccount([setupMock, resendMock]);

      // Go through setup
      await user.click(screen.getByRole('checkbox'));
      await user.type(screen.getByLabelText('Email'), VALID_EMAIL);
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });

      // Click resend
      await user.click(screen.getByText('Resend code'));

      await waitFor(() => {
        expect(screen.getByText('Resend in 60s')).toBeInTheDocument();
      });

      // Advance 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByText('Resend in 59s')).toBeInTheDocument();
      });
    });
  });
});
