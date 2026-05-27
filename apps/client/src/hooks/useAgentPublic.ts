/**
 * `useAgentPublic(handle)` — bundles the two public per-agent REST reads
 * needed to render the protocol-layer enrichments on a profile page
 * (Camada 3 behavior score + Camada 5 attestation).
 *
 * Calls are issued in parallel via `Promise.allSettled` so a failure on
 * one endpoint does NOT mask the other (e.g. an agent with no attestation
 * row should still render the behavior score).
 *
 * Returns `null` for the data slots while loading; on a hard failure
 * (network / 5xx) the respective slot stays `null` and the error is
 * exposed in `errors` so the consumer can show a quiet inline notice
 * without blowing up the whole page.
 *
 * AbortController is wired through `useEffect` cleanup — fast remounts
 * (e.g. fast navigation between profiles) cancel the previous fetch.
 */

import { useEffect, useState } from 'react';

import {
  getAgentBehavior,
  getCurrentAttestation,
  type AgentBehaviorPublic,
  type AttestationSummary,
} from '../api/agent-public';
import { RestApiError } from '../lib/rest';

export interface AgentPublicState {
  behavior: AgentBehaviorPublic | null;
  attestation: AttestationSummary | null;
  loading: boolean;
  errors: {
    behavior: RestApiError | Error | null;
    attestation: RestApiError | Error | null;
  };
}

const INITIAL: AgentPublicState = {
  behavior: null,
  attestation: null,
  loading: false,
  errors: { behavior: null, attestation: null },
};

export function useAgentPublic(handle: string | null | undefined): AgentPublicState {
  const [state, setState] = useState<AgentPublicState>(INITIAL);

  useEffect(() => {
    if (handle === null || handle === undefined || handle === '') {
      setState(INITIAL);
      return;
    }

    const controller = new AbortController();
    setState({
      behavior: null,
      attestation: null,
      loading: true,
      errors: { behavior: null, attestation: null },
    });

    Promise.allSettled([
      getAgentBehavior(handle, controller.signal),
      getCurrentAttestation(handle, controller.signal),
    ])
      .then(([behaviorResult, attestationResult]) => {
        if (controller.signal.aborted) return;
        setState({
          behavior: behaviorResult.status === 'fulfilled' ? behaviorResult.value : null,
          attestation:
            attestationResult.status === 'fulfilled' ? attestationResult.value.attestation : null,
          loading: false,
          errors: {
            behavior:
              behaviorResult.status === 'rejected' ? toError(behaviorResult.reason) : null,
            attestation:
              attestationResult.status === 'rejected' ? toError(attestationResult.reason) : null,
          },
        });
      })
      .catch(() => {
        // Promise.allSettled never rejects, but defend anyway.
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      controller.abort();
    };
  }, [handle]);

  return state;
}

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(String(reason));
}
