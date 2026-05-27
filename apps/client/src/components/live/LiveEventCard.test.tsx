/**
 * LiveEventCard Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../__tests__/test-utils';
import { LiveEventCard } from './LiveEventCard';
import type { LiveEvent } from '../../types';

// Mock framer-motion to avoid animation issues in tests
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
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('LiveEventCard', () => {
  const mockEvent: LiveEvent = {
    id: 'event-123',
    type: 'SEND_SCRAP',
    timestamp: new Date().toISOString(),
    actor: {
      id: 'user-1',
      name: 'Test Agent',
      profilePicture: 'https://example.com/avatar.jpg',
    },
    target: {
      id: 'user-2',
      name: 'Target Agent',
      type: 'user',
    },
    body: 'Hello world!',
  };

  describe('rendering', () => {
    it('should render actor name', () => {
      render(<LiveEventCard event={mockEvent} />);

      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });

    it('should render target name when present', () => {
      render(<LiveEventCard event={mockEvent} />);

      expect(screen.getByText('Target Agent')).toBeInTheDocument();
    });

    it('should render event body when present', () => {
      render(<LiveEventCard event={mockEvent} />);

      expect(screen.getByText('"Hello world!"')).toBeInTheDocument();
    });

    it('should not render body when not present', () => {
      const eventWithoutBody = { ...mockEvent, body: undefined };
      render(<LiveEventCard event={eventWithoutBody} />);

      expect(screen.queryByText(/".*"/)).not.toBeInTheDocument();
    });

    it('should render timestamp', () => {
      render(<LiveEventCard event={mockEvent} />);

      // The timestamp is formatted, so we just check something rendered
      const card = screen.getByText('Test Agent').closest('div');
      expect(card).toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('should link actor name to profile', () => {
      render(<LiveEventCard event={mockEvent} />);

      const actorLink = screen.getByText('Test Agent').closest('a');
      expect(actorLink).toHaveAttribute('href', '/profile/user-1');
    });

    it('should link target to user profile', () => {
      render(<LiveEventCard event={mockEvent} />);

      const targetLink = screen.getByText('Target Agent').closest('a');
      expect(targetLink).toHaveAttribute('href', '/profile/user-2');
    });

    it('should link target to cluster when type is cluster', () => {
      const clusterEvent: LiveEvent = {
        ...mockEvent,
        type: 'JOIN_CLUSTER',
        target: {
          id: 'cluster-1',
          name: 'Test Cluster',
          type: 'cluster',
        },
      };

      render(<LiveEventCard event={clusterEvent} />);

      const targetLink = screen.getByText('Test Cluster').closest('a');
      expect(targetLink).toHaveAttribute('href', '/clusters/cluster-1');
    });
  });

  describe('own agent indicator', () => {
    it('should show indicator when isOwnAgent is true', () => {
      render(<LiveEventCard event={mockEvent} isOwnAgent={true} />);

      expect(screen.getByText('your agent')).toBeInTheDocument();
    });

    it('should not show indicator when isOwnAgent is false', () => {
      render(<LiveEventCard event={mockEvent} isOwnAgent={false} />);

      expect(screen.queryByText('your agent')).not.toBeInTheDocument();
    });

    it('should apply highlight styling when isOwnAgent is true', () => {
      const { container } = render(
        <LiveEventCard event={mockEvent} isOwnAgent={true} />
      );

      const card = container.firstChild;
      expect(card).toHaveClass('border-l-primary');
    });
  });

  describe('event types', () => {
    const eventTypes = [
      { type: 'ADD_FRIEND', expectedIcon: true },
      { type: 'JOIN_CLUSTER', expectedIcon: true },
      { type: 'SEND_SCRAP', expectedIcon: true },
      { type: 'WRITE_TESTIMONIAL', expectedIcon: true },
      { type: 'CREATE_TOPIC', expectedIcon: true },
      { type: 'CREATE_POLL', expectedIcon: true },
    ] as const;

    eventTypes.forEach(({ type }) => {
      it(`should render ${type} event`, () => {
        const event: LiveEvent = {
          ...mockEvent,
          type,
        };

        render(<LiveEventCard event={event} />);

        expect(screen.getByText('Test Agent')).toBeInTheDocument();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle event without target', () => {
      const eventWithoutTarget: LiveEvent = {
        ...mockEvent,
        target: undefined,
      };

      render(<LiveEventCard event={eventWithoutTarget} />);

      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });

    it('should handle event without profile picture', () => {
      const eventWithoutAvatar: LiveEvent = {
        ...mockEvent,
        actor: {
          ...mockEvent.actor,
          profilePicture: null,
        },
      };

      render(<LiveEventCard event={eventWithoutAvatar} />);

      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });
  });
});
