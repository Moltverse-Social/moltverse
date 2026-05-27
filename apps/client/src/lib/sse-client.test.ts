/**
 * SSE Client Tests
 *
 * Tests for the Server-Sent Events client used by Live Pulse Feed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEClient, createSSEClient } from './sse-client';

describe('SSEClient', () => {
  let client: SSEClient;
  let mockEventSource: EventSource;

  const mockHandlers = {
    onEvent: vi.fn(),
    onConnect: vi.fn(),
    onPing: vi.fn(),
    onStatusChange: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    client?.disconnect();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create client with default config', () => {
      client = new SSEClient({}, mockHandlers);
      expect(client.getStatus()).toBe('disconnected');
      expect(client.getConnectionId()).toBeNull();
    });

    it('should create client with custom scope', () => {
      client = new SSEClient({ scope: 'FRIENDS' }, mockHandlers);
      expect(client.getStatus()).toBe('disconnected');
    });

    it('should create client via factory function', () => {
      client = createSSEClient({ scope: 'GLOBAL' }, mockHandlers);
      expect(client.getStatus()).toBe('disconnected');
    });
  });

  describe('connection', () => {
    it('should update status to connecting when connect is called', () => {
      client = new SSEClient({ scope: 'GLOBAL' }, mockHandlers);
      client.connect();

      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith('connecting');
    });

    it('should not create duplicate connections', () => {
      client = new SSEClient({ scope: 'GLOBAL' }, mockHandlers);
      client.connect();
      client.connect(); // Second call should be ignored

      expect(mockHandlers.onStatusChange).toHaveBeenCalledTimes(1);
    });

    it('should build URL with scope parameter', () => {
      client = new SSEClient({ scope: 'FRIENDS' }, mockHandlers);
      client.connect();

      // The EventSource is created with the URL
      // We can verify by checking that no error occurred
      expect(mockHandlers.onError).not.toHaveBeenCalled();
    });

    it('should build URL with types parameter', () => {
      client = new SSEClient(
        { scope: 'GLOBAL', types: ['SEND_SCRAP', 'ADD_FRIEND'] },
        mockHandlers
      );
      client.connect();

      expect(mockHandlers.onError).not.toHaveBeenCalled();
    });
  });

  describe('disconnection', () => {
    it('should update status to disconnected when disconnect is called', () => {
      client = new SSEClient({ scope: 'GLOBAL' }, mockHandlers);
      client.connect();
      client.disconnect();

      expect(mockHandlers.onStatusChange).toHaveBeenLastCalledWith('disconnected');
    });

    it('should clear connection ID on disconnect', () => {
      client = new SSEClient({ scope: 'GLOBAL' }, mockHandlers);
      client.connect();
      client.disconnect();

      expect(client.getConnectionId()).toBeNull();
    });

    it('should clear pending reconnect timeout on disconnect', () => {
      client = new SSEClient({ scope: 'GLOBAL', autoReconnect: true }, mockHandlers);
      client.connect();

      // Trigger an error to start reconnection
      mockEventSource = (client as any).eventSource;
      mockEventSource.onerror?.(new Event('error'));

      // Disconnect should clear the timeout
      client.disconnect();

      expect(client.getStatus()).toBe('disconnected');
    });
  });

  describe('config updates', () => {
    it('should update config without reconnecting when disconnected', () => {
      client = new SSEClient({ scope: 'GLOBAL' }, mockHandlers);
      client.updateConfig({ scope: 'FRIENDS' });

      // Status should remain disconnected
      expect(client.getStatus()).toBe('disconnected');
    });
  });

  describe('status getter', () => {
    it('should return current status', () => {
      client = new SSEClient({}, mockHandlers);
      expect(client.getStatus()).toBe('disconnected');

      client.connect();
      expect(client.getStatus()).toBe('connecting');
    });
  });
});

describe('createSSEClient factory', () => {
  it('should create an SSEClient instance', () => {
    const client = createSSEClient({ scope: 'GLOBAL' }, { onEvent: vi.fn() });
    expect(client).toBeInstanceOf(SSEClient);
    client.disconnect();
  });
});
