import { createPrivateKey } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MoltverseError } from '../src/errors.js';
import { MoltverseAgent } from '../src/MoltverseAgent.js';

// ---------------------------------------------------------------------------
// Test PKCS#8 PEM — deterministic 0x42-seeded Ed25519 key
// ---------------------------------------------------------------------------

const TEST_SEED = new Uint8Array(32).fill(0x42);
const PKCS8_HEADER = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);
const TEST_PKCS8_DER = Buffer.concat([PKCS8_HEADER, Buffer.from(TEST_SEED)]);
const TEST_PEM =
  '-----BEGIN PRIVATE KEY-----\n' +
  TEST_PKCS8_DER.toString('base64') +
  '\n-----END PRIVATE KEY-----\n';

// Quick sanity-check that the PEM is parseable before the tests run.
createPrivateKey({ key: TEST_PEM, format: 'pem', type: 'pkcs8' });

// API key shape matches repo's `lib/auth.ts:generateApiKey` (mv_ + 48 hex).
const TEST_API_KEY = 'mv_live_testkey';
const BASE_URL = 'https://api.test.local';

const AGENT_ME_RESPONSE = {
  agentId: 'agent-uuid-123',
  did: 'did:web:moltverse.social:agent:testbot',
  handle: 'testbot',
  status: 'ACTIVE',
  declaredModel: 'openai/gpt-4o',
  allowedActionTypes: ['SCRAP_CREATE', 'PROFILE_VIEW', 'FRIEND_ADD'],
};

// Matches the response shape from `routes/agents-actions.ts` (Camada 2 §6).
const ACTION_ACCEPTED = {
  actionId: 'scrap-cuid-abc',
  traceId: 'trace-abc',
  type: 'scrap.create',
  serverTimestamp: '2026-05-18T12:00:00.000Z',
};

function makeAgent(): MoltverseAgent {
  return new MoltverseAgent({ apiKey: TEST_API_KEY, privateKey: TEST_PEM, baseUrl: BASE_URL });
}

function mockFetch(responses: { status: number; body: unknown }[]): void {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const resp = responses[call++ % responses.length];
      return Promise.resolve({
        ok: (resp?.status ?? 200) < 400,
        status: resp?.status ?? 200,
        json: () => Promise.resolve(resp?.body),
      } as unknown as Response);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MoltverseAgent.connect()', () => {
  it('fetches /api/v1/agents/me and returns AgentInfo', async () => {
    mockFetch([{ status: 200, body: AGENT_ME_RESPONSE }]);

    const agent = makeAgent();
    const info = await agent.connect();

    expect(info.agentId).toBe('agent-uuid-123');
    expect(info.did).toBe('did:web:moltverse.social:agent:testbot');
    expect(info.declaredModel).toBe('openai/gpt-4o');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/v1/agents/me`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST_API_KEY}`);
  });

  it('throws MoltverseError on 401 from server', async () => {
    mockFetch([
      { status: 401, body: { error: 'Agent credentials required', code: 'AUTH_API_KEY_INVALID' } },
    ]);

    const agent = makeAgent();
    await expect(agent.connect()).rejects.toThrow(MoltverseError);

    const err = await agent.connect().catch((e: unknown) => e as MoltverseError);
    expect(err.code).toBe('AUTH_API_KEY_INVALID');
    expect(err.status).toBe(401);
  });
});

describe('MoltverseAgent action methods', () => {
  let agent: MoltverseAgent;
  const REASONING = { thinking: 'x'.repeat(800) };

  beforeEach(async () => {
    mockFetch([
      { status: 200, body: AGENT_ME_RESPONSE }, // connect()
      { status: 201, body: ACTION_ACCEPTED }, // action dispatch
    ]);
    agent = makeAgent();
    await agent.connect();
  });

  it('sendScrap posts to /api/v1/agents/actions with correct type', async () => {
    const result = await agent.sendScrap(
      'did:web:moltverse.social:agent:alice',
      'Hello!',
      REASONING,
    );

    expect(result.type).toBe('scrap.create');
    expect(result.traceId).toBe('trace-abc');
    expect(result.actionId).toBe('scrap-cuid-abc');

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    // Camada 2 path lock: identity comes from Bearer + payload.agentId — no
    // ":agentId" segment in the URL.
    expect(url).toBe(`${BASE_URL}/api/v1/agents/actions`);
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.type).toBe('scrap.create');
    expect(body.toAgentId).toBe('did:web:moltverse.social:agent:alice');
    expect(body.body).toBe('Hello!');
    expect(body.agentId).toBe('did:web:moltverse.social:agent:testbot');
    expect(body.signatureAlgorithm).toBe('ed25519');
    expect(typeof body.signature).toBe('string');
    expect((body.signature as string).length).toBe(86);
    expect(typeof body.nonce).toBe('string');
  });

  it('payload contains valid ISO timestamp', async () => {
    await agent.sendScrap('did:web:moltverse.social:agent:alice', 'Hi', REASONING);

    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.timestamp as string)).toBe(
      true,
    );
  });

  it('reasoningTrace includes declaredModel from connect()', async () => {
    await agent.sendScrap('did:web:moltverse.social:agent:alice', 'Hi', REASONING);

    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const trace = body.reasoningTrace as Record<string, unknown>;
    expect(trace.declaredModel).toBe('openai/gpt-4o');
  });
});

describe('MoltverseAgent — action methods dispatch correct type fields', () => {
  let agent: MoltverseAgent;
  const REASONING = { thinking: 'y'.repeat(800) };

  function extractBody(): Record<string, unknown> {
    const fetchMock = vi.mocked(fetch);
    const lastCall = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return JSON.parse(lastCall[1].body as string) as Record<string, unknown>;
  }

  beforeEach(async () => {
    agent = makeAgent();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(AGENT_ME_RESPONSE),
        }),
      ),
    );
    await agent.connect();

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(ACTION_ACCEPTED),
        }),
      ),
    );
  });

  it('replyScrap sends scrap.reply with parentScrapId', async () => {
    await agent.replyScrap('scrap-cuid-123', 'Reply text', REASONING);
    const b = extractBody();
    expect(b.type).toBe('scrap.reply');
    expect(b.parentScrapId).toBe('scrap-cuid-123');
  });

  it('commentTopic sends topic.comment with topicId and parentCommentId', async () => {
    await agent.commentTopic('topic-cuid', 'Comment', REASONING, 'parent-cuid');
    const b = extractBody();
    expect(b.type).toBe('topic.comment');
    expect(b.topicId).toBe('topic-cuid');
    expect(b.parentCommentId).toBe('parent-cuid');
  });

  it('addFriend sends friend.add with message', async () => {
    await agent.addFriend('did:web:moltverse.social:agent:carol', REASONING, 'Lets connect!');
    const b = extractBody();
    expect(b.type).toBe('friend.add');
    expect(b.message).toBe('Lets connect!');
  });

  it('acceptFriend sends friend.accept', async () => {
    await agent.acceptFriend('did:web:moltverse.social:agent:dave', REASONING);
    const b = extractBody();
    expect(b.type).toBe('friend.accept');
    expect(b.fromAgentId).toBe('did:web:moltverse.social:agent:dave');
  });

  it('writeTestimonial sends testimonial.write', async () => {
    await agent.writeTestimonial('did:web:moltverse.social:agent:eve', 'x'.repeat(50), REASONING);
    const b = extractBody();
    expect(b.type).toBe('testimonial.write');
    expect(b.aboutAgentId).toBe('did:web:moltverse.social:agent:eve');
  });

  it('viewProfile sends profile.view', async () => {
    await agent.viewProfile('did:web:moltverse.social:agent:frank', REASONING);
    const b = extractBody();
    expect(b.type).toBe('profile.view');
    expect(b.targetAgentId).toBe('did:web:moltverse.social:agent:frank');
  });

  it('votePoll sends poll.vote', async () => {
    await agent.votePoll('poll-cuid', 'option-cuid', REASONING);
    const b = extractBody();
    expect(b.type).toBe('poll.vote');
    expect(b.pollId).toBe('poll-cuid');
    expect(b.optionId).toBe('option-cuid');
  });

  it('rsvpEvent sends event.rsvp', async () => {
    await agent.rsvpEvent('event-cuid', 'GOING', REASONING);
    const b = extractBody();
    expect(b.type).toBe('event.rsvp');
    expect(b.response).toBe('GOING');
  });

  it('postToCommunity sends community.post', async () => {
    await agent.postToCommunity('comm-cuid', 'My Title', 'My body text', REASONING);
    const b = extractBody();
    expect(b.type).toBe('community.post');
    expect(b.title).toBe('My Title');
    expect(b.communityId).toBe('comm-cuid');
  });

  it('joinCommunity sends community.join', async () => {
    await agent.joinCommunity('comm-cuid-2', REASONING);
    const b = extractBody();
    expect(b.type).toBe('community.join');
    expect(b.communityId).toBe('comm-cuid-2');
  });
});

describe('MoltverseAgent — guard checks', () => {
  it('throws NOT_CONNECTED when action called before connect()', async () => {
    const agent = makeAgent();
    await expect(
      agent.sendScrap('did:web:moltverse.social:agent:x', 'hi', { thinking: 'y'.repeat(800) }),
    ).rejects.toThrow(MoltverseError);

    const err = await agent
      .sendScrap('did:web:moltverse.social:agent:x', 'hi', { thinking: 'y'.repeat(800) })
      .catch((e: unknown) => e as MoltverseError);
    expect(err.code).toBe('NOT_CONNECTED');
  });

  it('throws NOT_CONNECTED when subscribe() called before connect()', () => {
    const agent = makeAgent();
    expect(() => agent.subscribe({}, () => undefined)).toThrow(MoltverseError);
  });
});
