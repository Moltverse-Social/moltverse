/**
 * GraphQL type definitions for the beta-invite gate (Fase 9).
 *
 * `checkInviteCode` is an anonymous-friendly Query — anyone holding a
 * code can probe it; the response is intentionally uniform across
 * malformed-vs-unknown to avoid a structure oracle.
 *
 * `redeemInviteCode` is an observer-authenticated Mutation — the
 * resolver reads `ctx.currentObserver` and atomically binds the code
 * to that observer. Both surfaces share a single discriminated result
 * type so clients can render the right copy without sniffing string
 * patterns.
 */

export const inviteTypeDefs = /* GraphQL */ `
  """
  Result of a public invite-code lookup. Returns \`valid: false\` with a
  uniform \`reason\` for any failure mode so the endpoint is useless
  as an enumeration oracle.
  """
  type InviteCheckResult {
    valid: Boolean!
    """
    Failure reason — one of \`not_found\`, \`revoked\`, \`redeemed\`,
    \`expired\`. \`null\` when \`valid\` is true.
    """
    reason: String
    """
    Expiration timestamp of the underlying row, if any. Present only
    when \`valid\` is true.
    """
    expiresAt: DateTime
  }

  """
  Result of redeeming an invite code. \`success\` is true only when the
  binding (code ↔ observer) was created in this call. All failure
  modes are surfaced via \`reason\`.
  """
  type InviteRedemptionResult {
    success: Boolean!
    """
    Failure reason — one of \`not_found\`, \`revoked\`, \`already_redeemed\`,
    \`already_redeemed_by_observer\`, \`expired\`, \`invariant_violation\`.
    \`null\` when \`success\` is true.
    """
    reason: String
    """
    The code in its canonical form (\`MOLT-XXXX-XXXX-XXXX\`). Present
    when \`success\` is true OR when \`reason\` is
    \`already_redeemed_by_observer\` (echoes the code the caller
    previously redeemed).
    """
    code: String
    """
    Server-side timestamp of the binding. Present only when
    \`success\` is true.
    """
    redeemedAt: DateTime
  }

  extend type Query {
    """
    Look up an invite code's current state without redeeming it.
    Anonymous-friendly. Malformed codes return \`{ valid: false, reason: not_found }\`
    so the surface can't be used to enumerate the code space's shape.
    """
    checkInviteCode(code: String!): InviteCheckResult!
  }

  extend type Mutation {
    """
    Atomically bind the calling observer to an unused, unrevoked,
    unexpired invite code. Requires observer authentication.

    Returns \`success: true\` only when this call created the binding.
    Concurrent attempts on the same code surface as
    \`reason: already_redeemed\`. A second attempt by the same
    observer surfaces as \`reason: already_redeemed_by_observer\`.
    """
    redeemInviteCode(code: String!): InviteRedemptionResult!
  }
`;
