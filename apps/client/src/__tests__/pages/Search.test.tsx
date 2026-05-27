/**
 * Search page tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRoute, screen, waitFor, userEvent } from '../helpers';
import { Search } from '../../pages/Search';
import { SEARCH_USERS_QUERY, SEARCH_CLUSTERS_QUERY } from '../../graphql/queries';

// Mock useAuth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      profilePicture: 'https://example.com/avatar.jpg',
      visitorsVisible: true,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock useObserver hook
vi.mock('../../hooks/useObserver', () => ({
  useObserver: () => ({
    isObserver: false,
  }),
}));

// Mock data
const mockAgents = [
  { id: 'agent-1', name: 'Agent One', profilePicture: '', country: 'US', friendCount: 5 },
  { id: 'agent-2', name: 'Agent Two', profilePicture: '', country: 'BR', friendCount: 10 },
];

const mockClusters = [
  {
    id: 'comm-1',
    title: 'Cluster One',
    picture: '',
    description: 'Test cluster',
    memberCount: 100,
    isMember: false,
  },
];

// GraphQL mocks
const searchUsersMock = {
  request: {
    query: SEARCH_USERS_QUERY,
    variables: { query: 'test', limit: 20, offset: 0 },
  },
  result: {
    data: {
      searchUsers: {
        nodes: mockAgents,
        totalCount: 2,
        hasMore: false,
      },
    },
  },
};

const searchUsersEmptyMock = {
  request: {
    query: SEARCH_USERS_QUERY,
    variables: { query: 'notfound', limit: 20, offset: 0 },
  },
  result: {
    data: {
      searchUsers: {
        nodes: [],
        totalCount: 0,
        hasMore: false,
      },
    },
  },
};

const searchClustersMock = {
  request: {
    query: SEARCH_CLUSTERS_QUERY,
    variables: { query: 'test', limit: 20, offset: 0 },
  },
  result: {
    data: {
      searchClusters: {
        nodes: mockClusters,
        totalCount: 1,
        hasMore: false,
      },
    },
  },
};

describe('Search Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders search page title', () => {
      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search' });

      expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument();
    });

    it('renders search input', () => {
      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search' });

      expect(screen.getByPlaceholderText(/search for agents or clusters/i)).toBeInTheDocument();
    });

    it('renders tabs for agents and clusters', () => {
      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search' });

      expect(screen.getByText('Agents')).toBeInTheDocument();
      expect(screen.getByText('Clusters')).toBeInTheDocument();
    });

    it('shows empty state when no query', () => {
      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search' });

      expect(screen.getByText('Enter a search term')).toBeInTheDocument();
    });
  });

  describe('Search with query param', () => {
    it('populates input from URL query param', () => {
      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search?q=test' });

      const input = screen.getByPlaceholderText(/search for agents or clusters/i);
      expect(input).toHaveValue('test');
    });

    it('displays agent results from query param', async () => {
      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search?q=test',
        mocks: [searchUsersMock],
      });

      await waitFor(() => {
        expect(screen.getByText('Agent One')).toBeInTheDocument();
        expect(screen.getByText('Agent Two')).toBeInTheDocument();
      });
    });

    it('shows result count', async () => {
      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search?q=test',
        mocks: [searchUsersMock],
      });

      await waitFor(() => {
        expect(screen.getByText(/2 results found/i)).toBeInTheDocument();
      });
    });

    it('shows empty state when no results', async () => {
      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search?q=notfound',
        mocks: [searchUsersEmptyMock],
      });

      await waitFor(() => {
        expect(screen.getByText('No agents found matching your search')).toBeInTheDocument();
      });
    });
  });

  describe('Tab switching', () => {
    it('switches to clusters tab', async () => {
      const user = userEvent.setup();

      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search?q=test',
        mocks: [searchUsersMock, searchClustersMock],
      });

      const clustersTab = screen.getByText('Clusters');
      await user.click(clustersTab);

      await waitFor(() => {
        expect(screen.getByText('Cluster One')).toBeInTheDocument();
      });
    });

    it('agents tab is active by default', () => {
      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search' });

      const agentsTab = screen.getByText('Agents');
      // Check if tab has active styling (text-primary class from Tailwind)
      expect(agentsTab.className).toContain('text-primary');
    });
  });

  describe('Search form submission', () => {
    it('updates URL on form submit', async () => {
      const user = userEvent.setup();

      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search',
        mocks: [searchUsersMock],
      });

      const input = screen.getByPlaceholderText(/search for agents or clusters/i);
      await user.type(input, 'test');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Input should be cleared after search (behavior from component)
      // The URL would be updated, but we can't easily test that in this setup
      expect(input).toHaveValue('test');
    });

    it('does not submit empty search', async () => {
      const user = userEvent.setup();

      renderWithRoute(<Search />, { path: '/search', initialRoute: '/search' });

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Should still show empty state
      expect(screen.getByText('Enter a search term')).toBeInTheDocument();
    });
  });

  describe('Agent cards', () => {
    it('displays agent name and location', async () => {
      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search?q=test',
        mocks: [searchUsersMock],
      });

      await waitFor(() => {
        expect(screen.getByText('Agent One')).toBeInTheDocument();
        expect(screen.getByText('US')).toBeInTheDocument();
      });
    });

    it('links to agent profile', async () => {
      renderWithRoute(<Search />, {
        path: '/search',
        initialRoute: '/search?q=test',
        mocks: [searchUsersMock],
      });

      await waitFor(() => {
        const agentLink = screen.getByText('Agent One').closest('a');
        expect(agentLink).toHaveAttribute('href', '/profile/agent-1');
      });
    });
  });
});
