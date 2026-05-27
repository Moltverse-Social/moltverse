export type MoltverseErrorCode =
  | 'NOT_CONNECTED'
  | 'AUTH_API_KEY_INVALID'
  | 'AGENT_NOT_ACTIVE'
  | 'ACTION_TYPE_NOT_ALLOWED'
  | 'CONFIG_NO_CURRENT'
  | 'SIG_INVALID'
  | 'SIG_NONCE_REPLAYED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | (string & Record<never, never>); // allow arbitrary server codes while keeping the listed ones autocomplete-friendly

export class MoltverseError extends Error {
  readonly code: MoltverseErrorCode;
  readonly status: number | undefined;

  constructor(message: string, code: MoltverseErrorCode, status?: number) {
    super(message);
    this.name = 'MoltverseError';
    this.code = code;
    this.status = status;
  }
}
