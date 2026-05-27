/**
 * LivePulseFeed Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../__tests__/test-utils';
import { LivePulseFeed } from './LivePulseFeed';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
    }) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    button: ({
      children,
      className,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: () => void;
    }) => (
      <button className={className} onClick={onClick} {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock useContextLiveFeed hook (component uses this, not useLiveFeed)
const mockUseContextLiveFeed = vi.fn();
vi.mock('../../hooks/useContextLiveFeed', () => ({
  useContextLiveFeed: () => mockUseContextLiveFeed(),
}));

// Mock useFeedWithAds hook to pass through items in FeedItem format
vi.mock('../../hooks/useFeedWithAds', () => ({
  useFeedWithAds: (items: unknown[]) => ({
    items: items.map((item) => ({ type: 'event', data: item })),
    currentAd: null,
    isLoading: false,
    error: null,
    refetchAd: vi.fn(),
  }),
}));

// Mock useAuth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', name: 'Test User' },
    isLoading: false,
  }),
}));

// Mock useObserver hook
vi.mock('../../hooks/useObserver', () => ({
  useObserver: () => ({
    isObserver: false,
    observer: null,
    isLoading: false,
  }),
}));

// Mock Apollo Client useQuery
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: null,
      loading: false,
      error: null,
      fetchMore: vi.fn(),
    })),
  };
});

// Mock child components to isolate unit tests
vi.mock('../feed', () => ({
  FeedCard: ({ event }: { event: { actor: { name: string } } }) => (
    <div data-testid="feed-card">{event.actor.name}</div>
  ),
  FeedCardSkeleton: () => <div data-testid="feed-skeleton">Loading...</div>,
}));

vi.mock('../ads/FeedAd', () => ({
  FeedAd: () => <div data-testid="feed-ad">Ad</div>,
}));

vi.mock('./LiveFeedFilter', () => ({
  LiveFeedFilter: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select
      role="combobox"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="GLOBAL">Everyone</option>
      <option value="FRIENDS">Friends</option>
      <option value="MY_AGENT">My Agent</option>
    </select>
  ),
}));

// Mock IntersectionObserver (used for infinite scroll sentinel)
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
});
globalThis.IntersectionObserver =
  mockIntersectionObserver as unknown as typeof IntersectionObserver;

// Helper to create a mock event
function createMockEvent(overrides = {}) {
  return {
    id: 'event-1',
    type: 'SEND_SCRAP',
    timestamp: new Date().toISOString(),
    actor: { id: 'user-1', name: 'Agent One', profilePicture: null },
    target: { id: 'user-2', name: 'Agent Two', type: 'user' },
    ...overrides,
  };
}

// Helper to create default context value
function createContextValue(overrides = {}) {
  return {
    events: [],
    status: 'connected',
    isConnected: true,
    connect: vi.fn(),
    scope: 'GLOBAL',
    setScope: vi.fn(),
    resetMissedCount: vi.fn(),
    markHomeHidden: vi.fn(),
    ...overrides,
  };
}

describe('LivePulseFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseContextLiveFeed.mockReturnValue(createContextValue());
  });

  describe('rendering', () => {
    it('should render LIVE badge', () => {
      render(<LivePulseFeed />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('should render filter when showFilter is true', () => {
      render(<LivePulseFeed showFilter={true} />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('should not render filter when showFilter is false', () => {
      render(<LivePulseFeed showFilter={false} />);
      const select = screen.queryByRole('combobox');
      expect(select).not.toBeInTheDocument();
    });

    it('should render stats footer when events exist', () => {
      mockUseContextLiveFeed.mockReturnValue(
        createContextValue({ events: [createMockEvent()] })
      );

      render(<LivePulseFeed />);
      expect(
        screen.getByText(/events? in feed/i)
      ).toBeInTheDocument();
    });
  });

  describe('connection status', () => {
    it('should show connected status when connected', () => {
      render(<LivePulseFeed />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('should show empty state when no events', () => {
      render(<LivePulseFeed />);
      expect(screen.getByText('Waiting for events')).toBeInTheDocument();
    });

    it('should show disconnected state', () => {
      mockUseContextLiveFeed.mockReturnValue(
        createContextValue({
          status: 'disconnected',
          isConnected: false,
        })
      );

      render(<LivePulseFeed />);
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });
  });

  describe('events display', () => {
    it('should render events when available', () => {
      mockUseContextLiveFeed.mockReturnValue(
        createContextValue({ events: [createMockEvent()] })
      );

      render(<LivePulseFeed />);
      expect(screen.getByText('Agent One')).toBeInTheDocument();
    });
  });

  describe('filter interaction', () => {
    it('should render filter with current scope', () => {
      render(<LivePulseFeed />);
      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('GLOBAL');
    });
  });

  describe('props', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <LivePulseFeed className="custom-feed" />
      );
      const feedContainer = container.firstChild;
      expect(feedContainer).toHaveClass('custom-feed');
    });

    it('should use initialScope prop', () => {
      render(<LivePulseFeed initialScope="FRIENDS" />);
      expect(mockUseContextLiveFeed).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have event list container', () => {
      const { container } = render(<LivePulseFeed />);
      const listContainer = container.querySelector('.space-y-3');
      expect(listContainer).toBeInTheDocument();
    });
  });
});
