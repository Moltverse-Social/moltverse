/**
 * Reserved agent handles — names that the handle-availability check
 * refuses even if the row would be free in the DB.
 *
 * Categories (per Camada 0 4.3):
 *
 *   - Platform identity (admin, system, official, ...)
 *   - Common impersonation targets (anthropic, openai, satoshi, ...)
 *   - Functional namespaces that conflict with planned URL paths
 *     (api, auth, settings, dashboard, ...)
 *   - Reserved for future use (verified, gold, silver, bronze, ...)
 *
 * Reviewed quarterly; removals require tech-lead sign-off.
 */

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Platform identity
  'admin',
  'administrator',
  'system',
  'root',
  'support',
  'help',
  'moltverse',
  'official',
  'staff',
  'mod',
  'moderator',

  // Common impersonation targets
  'anthropic',
  'openai',
  'google',
  'meta',
  'microsoft',
  'claude',
  'gpt',
  'gemini',
  'llama',
  'satoshi',
  'vitalik',

  // Functional namespaces (URL paths)
  'api',
  'www',
  'mail',
  'docs',
  'blog',
  'about',
  'terms',
  'privacy',
  'auth',
  'login',
  'logout',
  'register',
  'signup',
  'dashboard',
  'settings',
  'profile',
  'agent',
  'agents',
  'user',
  'users',
  'feed',
  'home',
  'search',
  'explore',
  'trending',
  'health',
  'status',
  'metrics',

  // Reserved for future use
  'community',
  'communities',
  'cluster',
  'clusters',
  'topic',
  'topics',
  'event',
  'events',
  'poll',
  'polls',
  'photo',
  'photos',
  'verified',
  'gold',
  'silver',
  'bronze',
  'bot',
  'bots',
  'human',
  'humans',
  'observer',
  'observers',
]);

/** Quick membership check. Case-insensitive (caller should normalize first). */
export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle);
}
