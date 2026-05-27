/**
 * REST wrappers for public per-agent reads (Camada 3 + Camada 5).
 *
 *   GET /api/v1/agents/:handle/behavior   — Camada 3 score
 *   GET /api/v1/agents/:handle/attestation — Camada 5 current attestation
 *   GET /api/v1/agents/:handle/attestation/history — last N attestations
 *
 * All endpoints are unauthenticated; the wrapper just shapes the typed
 * response and surfaces `RestApiError`s so the consumer can branch on
 * `AGENT_NOT_FOUND` to render a 404 state.
 */

import { restRequest } from '../lib/rest';

// ---------------------------------------------------------------------------
// Behavior (Camada 3)
// ---------------------------------------------------------------------------

export type ScoreCategory =
  | 'AUTHENTIC'
  | 'SUSPICIOUS'
  | 'ANOMALOUS'
  | 'INSUFFICIENT_DATA';

export type FlagSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export interface BehaviorFlag {
  flag: string;
  source: string;
  severity: FlagSeverity;
  raisedAt: string;
}

export interface AgentBehaviorPublic {
  agentHandle: string;
  did: string | null;
  score: number;
  scoreCategory: ScoreCategory;
  computedAt: string | null;
  windowDays: number | null;
  /**
   * Public features only — the server strips `{public: false}` features
   * before responding. Shape is a free-form record keyed by feature id.
   */
  features: Record<string, unknown>;
  flags: BehaviorFlag[];
  insufficientData: boolean;
}

export function getAgentBehavior(
  handle: string,
  signal?: AbortSignal,
): Promise<AgentBehaviorPublic> {
  return restRequest<AgentBehaviorPublic>(
    `/api/v1/agents/${encodeURIComponent(handle)}/behavior`,
    {
      ...(signal !== undefined ? { signal } : {}),
    },
  );
}

// ---------------------------------------------------------------------------
// Attestation (Camada 5)
// ---------------------------------------------------------------------------

export type AttestationStatus =
  | 'PENDING_VERIFICATION'
  | 'VALID'
  | 'EXPIRED'
  | 'INVALID'
  | 'SUPERSEDED'
  | 'REVOKED';

export interface AttestationSummary {
  id: string;
  status: AttestationStatus;
  composeHash: string;
  composeHashEntry: unknown;
  attestedAt: string;
  expiresAt: string;
  quoteUri: string;
  onChainTxHash: string | null;
  validatorAddress: string | null;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
}

export interface CurrentAttestationResponse {
  attestation: AttestationSummary | null;
}

export interface AttestationHistoryResponse {
  agentId: string;
  agentHandle: string;
  items: AttestationSummary[];
}

export function getCurrentAttestation(
  handle: string,
  signal?: AbortSignal,
): Promise<CurrentAttestationResponse> {
  return restRequest<CurrentAttestationResponse>(
    `/api/v1/agents/${encodeURIComponent(handle)}/attestation`,
    {
      ...(signal !== undefined ? { signal } : {}),
    },
  );
}

export function getAttestationHistory(
  handle: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<AttestationHistoryResponse> {
  const qs = limit === undefined ? '' : `?limit=${limit.toString()}`;
  return restRequest<AttestationHistoryResponse>(
    `/api/v1/agents/${encodeURIComponent(handle)}/attestation/history${qs}`,
    {
      ...(signal !== undefined ? { signal } : {}),
    },
  );
}
