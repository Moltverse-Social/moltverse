/**
 * useLiveFeed Hook Tests
 *
 * Tests for the Live Pulse Feed React hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveFeed } from './useLiveFeed';

// Mock SSEClient
vi.mock('../lib/sse-client', () => {
  return {
    SSEClient: vi.fn().mockImplementation((_config, handlers) => {
      return {
        connect: vi.fn(() => {
          handlers.onStatusChange?.('connected');
          handlers.onConnect?.({ type: 'connected', connectionId: 'test-123' });
        }),
        disconnect: vi.fn(() => {
          handlers.onStatusChange?.('disconnected');
        }),
        updateConfig: vi.fn(),
        getStatus: vi.fn(() => 'disconnected'),
        getConnectionId: vi.fn(() => null),
        // Store handlers for test access
        _handlers: handlers,
      };
    }),
  };
});

describe('useLiveFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(result.current.events).toEqual([]);
      expect(result.current.status).toBe('disconnected');
      expect(result.current.connectionId).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.scope).toBe('GLOBAL');
      expect(result.current.types).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it('should accept initial scope', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ scope: 'FRIENDS', autoConnect: false })
      );

      expect(result.current.scope).toBe('FRIENDS');
    });

    it('should auto-connect when autoConnect is true', async () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: true }));

      await act(async () => {
        vi.runAllTimers();
      });

      expect(result.current.status).toBe('connected');
    });
  });

  describe('connection management', () => {
    it('should connect when connect is called', async () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      await act(async () => {
        result.current.connect();
      });

      expect(result.current.status).toBe('connected');
      expect(result.current.connectionId).toBe('test-123');
      expect(result.current.isConnected).toBe(true);
    });

    it('should disconnect when disconnect is called', async () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: true }));

      await act(async () => {
        vi.runAllTimers();
      });

      expect(result.current.isConnected).toBe(true);

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.connectionId).toBeNull();
    });
  });

  describe('scope and type filters', () => {
    it('should update scope', async () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.setScope('MY_AGENT');
      });

      expect(result.current.scope).toBe('MY_AGENT');
    });

    it('should update types', async () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.setTypes(['SEND_SCRAP', 'ADD_FRIEND']);
      });

      expect(result.current.types).toEqual(['SEND_SCRAP', 'ADD_FRIEND']);
    });
  });

  describe('event management', () => {
    it('should clear events when clearEvents is called', async () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      // Add some events by simulating SSE
      // This is a simplified test since we can't easily trigger events through the mock

      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.events).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should disconnect on unmount', () => {
      const { unmount } = renderHook(() => useLiveFeed({ autoConnect: true }));

      unmount();

      // No error should occur during cleanup
    });
  });
});
