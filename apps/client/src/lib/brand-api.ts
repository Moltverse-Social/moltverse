/**
 * Brand API client
 *
 * @deprecated This module is deprecated. Brand accounts have been merged into
 * the User model with accountType='BUSINESS'. Authentication should now use
 * agent API keys. This file is kept for backwards compatibility during migration.
 *
 * REST API client for brand authentication and campaign management.
 * Uses HTTP-only cookies for authentication (more secure than localStorage).
 *
 * @module lib/brand-api
 */

import type {
  BrandAuthResponse,
  BrandRefreshResponse,
  BrandMeResponse,
  BrandRegisterInput,
  BrandApiError,
  CampaignListResponse,
  CampaignResponse,
  CampaignStats,
  CampaignCreateInput,
  CampaignUpdateInput,
} from '../types';

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_URL = import.meta.env.VITE_API_URL || '';

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * API error class with code and details
 */
export class BrandApiClientError extends Error {
  code: string;
  details?: string;
  field?: string;
  status: number;

  constructor(error: BrandApiError, status: number) {
    super(error.error);
    this.name = 'BrandApiClientError';
    this.code = error.code;
    this.details = error.details;
    this.field = error.field;
    this.status = status;
  }
}

/**
 * Parse error response from API
 */
async function parseError(response: Response): Promise<BrandApiClientError> {
  try {
    const error = (await response.json()) as BrandApiError;
    return new BrandApiClientError(error, response.status);
  } catch {
    return new BrandApiClientError(
      { error: 'Unknown error', code: 'UNKNOWN_ERROR' },
      response.status
    );
  }
}

// =============================================================================
// REQUEST HELPERS
// =============================================================================

/**
 * Make authenticated request using HTTP-only cookies
 * Uses credentials: 'include' to send cookies with cross-origin requests
 */
async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge existing headers
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Send cookies with request
  });
}

// =============================================================================
// AUTH ENDPOINTS
// =============================================================================

/**
 * Register new brand account
 * Auth tokens are set via HTTP-only cookies by the server
 */
export async function brandRegister(
  data: BrandRegisterInput
): Promise<BrandAuthResponse> {
  const response = await fetch(`${API_URL}/api/v1/brands/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include', // Required to receive and store cookies
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Login brand account
 * Auth tokens are set via HTTP-only cookies by the server
 */
export async function brandLogin(
  email: string,
  password: string
): Promise<BrandAuthResponse> {
  const response = await fetch(`${API_URL}/api/v1/brands/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include', // Required to receive and store cookies
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Refresh access token
 * Refresh token is read from HTTP-only cookie by the server
 * New tokens are set as HTTP-only cookies
 */
export async function brandRefresh(): Promise<BrandRefreshResponse | null> {
  const response = await fetch(`${API_URL}/api/v1/brands/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send refresh token cookie, receive new cookies
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

/**
 * Get current brand profile
 */
export async function brandGetMe(): Promise<BrandMeResponse | null> {
  const response = await authFetch(`${API_URL}/api/v1/brands/me`);

  if (!response.ok) {
    return null;
  }

  return response.json();
}

/**
 * Logout brand (revoke refresh token and clear cookies)
 */
export async function brandLogout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/brands/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Send cookies, server will clear them
    });
  } catch {
    // Ignore errors
  }
}

// =============================================================================
// CAMPAIGN ENDPOINTS
// =============================================================================

/**
 * List campaigns
 */
export async function campaignList(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<CampaignListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const queryString = searchParams.toString();
  const url = `${API_URL}/api/v1/campaigns${queryString ? `?${queryString}` : ''}`;

  const response = await authFetch(url);

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Get campaign by ID
 */
export async function campaignGet(id: string): Promise<CampaignResponse> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}`);

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Create campaign
 */
export async function campaignCreate(
  data: CampaignCreateInput
): Promise<CampaignResponse> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Update campaign (DRAFT only)
 */
export async function campaignUpdate(
  id: string,
  data: CampaignUpdateInput
): Promise<CampaignResponse> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Delete campaign (DRAFT only)
 */
export async function campaignDelete(id: string): Promise<void> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw await parseError(response);
  }
}

/**
 * Submit campaign for review (DRAFT -> PENDING_REVIEW)
 */
export async function campaignSubmit(id: string): Promise<CampaignResponse> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}/submit`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Pause campaign (ACTIVE -> PAUSED)
 */
export async function campaignPause(id: string): Promise<CampaignResponse> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}/pause`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Resume campaign (PAUSED -> ACTIVE)
 */
export async function campaignResume(id: string): Promise<CampaignResponse> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}/resume`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

/**
 * Get campaign statistics
 */
export async function campaignGetStats(id: string): Promise<CampaignStats> {
  const response = await authFetch(`${API_URL}/api/v1/campaigns/${id}/stats`);

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}
