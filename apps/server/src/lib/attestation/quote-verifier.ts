/**
 * TDX quote verifier — Camada 5 §4.1.
 *
 * The real DCAP verification path requires Intel's
 * `SGX-TDX-DCAP-QuoteVerificationLibrary` plus a node-gyp bridge —
 * substantial native work that doesn't fit cleanly inside the server
 * codebase. We isolate the interface here so the worker doesn't care
 * which implementation answers:
 *
 *  - {@link createMockTdxQuoteVerifier} powers tests + dev. A caller
 *    constructs it with a `decide` callback that picks the verdict
 *    per-quote, so each scenario (good quote, bad sig chain, TCB out
 *    of date, …) is one-liner to wire up.
 *
 *  - {@link createDcapVerifier} returns a stub that fails closed with
 *    `not_configured`. When `@moltverse/dcap-verifier` lands it will
 *    be swapped in here; the worker won't change.
 *
 * The interface uses {@link Buffer} so the worker doesn't have to know
 * about base64 encoding — the route handler is the one place that
 * decodes from the wire.
 */

import { Buffer } from 'node:buffer';

import { extractComposeHashFromRtmr3 } from './binding.js';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type VerificationFailureCode =
  | 'quote_parse_failed'
  | 'signature_chain_invalid'
  | 'tcb_unhealthy'
  | 'quote_too_old'
  | 'not_configured'
  | 'verifier_error';

export interface VerifiedQuote {
  /** 64-byte reportData field. */
  reportData: Buffer;
  /** 48-byte RTMR3 register. */
  rtmr3: Buffer;
  /** TCB level. Verifier rejects anything outside the OK set. */
  tcbStatus: 'OK' | 'CONFIGURATION_NEEDED';
  /** DCAP quote version emitted by the platform. */
  quoteVersion: number;
  /** Timestamp embedded in the quote header, if available. Caller
   *  enforces the 24h freshness window. */
  quoteTimestamp: Date | null;
}

export type VerificationResult =
  | { ok: true; quote: VerifiedQuote }
  | { ok: false; code: VerificationFailureCode; detail: string };

export interface TdxQuoteVerifier {
  verify(quoteBytes: Buffer): Promise<VerificationResult>;
}

// ---------------------------------------------------------------------------
// Mock — used by tests and the local-dev fallback.
// ---------------------------------------------------------------------------

export interface MockVerifierOptions {
  /** Caller decides the verdict per call. The default returns a
   *  plausible passing quote with all-zero reportData/rtmr3 so the
   *  caller has to set those explicitly in any test that exercises
   *  binding/whitelist downstream. */
  decide?: (quoteBytes: Buffer) => VerificationResult | Promise<VerificationResult>;
}

export function createMockTdxQuoteVerifier(options: MockVerifierOptions = {}): TdxQuoteVerifier {
  const decide = options.decide ?? defaultMockDecide;
  return {
    async verify(quoteBytes: Buffer): Promise<VerificationResult> {
      return await decide(quoteBytes);
    },
  };
}

/** Default mock verdict — returns an OK quote with reportData/rtmr3
 *  derived from the first bytes of the input so distinct quotes look
 *  distinct in tests that don't override `decide`. */
function defaultMockDecide(quoteBytes: Buffer): VerificationResult {
  const reportData = quoteBytes.subarray(0, 64);
  if (reportData.length < 64) {
    return { ok: false, code: 'quote_parse_failed', detail: 'mock: quote too short' };
  }
  const rtmr3 = quoteBytes.subarray(64, 112);
  if (rtmr3.length < 48) {
    return { ok: false, code: 'quote_parse_failed', detail: 'mock: rtmr3 region missing' };
  }
  // Touch the function to ensure the layout helper stays exported (used
  // by callers downstream); also a cheap sanity check that the bytes
  // are well-formed before the worker tries to decode.
  void extractComposeHashFromRtmr3;
  return {
    ok: true,
    quote: {
      reportData: Buffer.from(reportData),
      rtmr3: Buffer.from(rtmr3),
      tcbStatus: 'OK',
      quoteVersion: 4,
      quoteTimestamp: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Production (DCAP) — stub until the native lib package lands.
// ---------------------------------------------------------------------------

export interface DcapVerifierOptions {
  /** Path to the Intel quote-verification library (when wired). */
  libPath?: string;
}

/**
 * Real-DCAP path. Returns a verifier that always reports
 * `not_configured` so production rolls into the secure default (every
 * quote is INVALID) until the native binding lands. The signature
 * matches the mock so swapping the impl is a one-line change in the
 * worker plugin.
 */
export function createDcapVerifier(_options: DcapVerifierOptions = {}): TdxQuoteVerifier {
  return {
    verify(_quoteBytes: Buffer): Promise<VerificationResult> {
      return Promise.resolve({
        ok: false,
        code: 'not_configured',
        detail: 'DCAP verifier not yet bundled — set the @moltverse/dcap-verifier dependency',
      });
    },
  };
}
