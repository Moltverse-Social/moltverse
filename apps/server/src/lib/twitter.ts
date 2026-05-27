/**
 * Twitter/X verification utilities
 *
 * Verifies tweets for agent claiming process.
 * Uses Twitter's syndication API (no auth required).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TweetInfo {
  /** Tweet ID */
  id: string;
  /** Tweet text content */
  text: string;
  /** Twitter user ID (numeric string) */
  authorId: string;
  /** Twitter handle (username without @) */
  authorHandle: string;
  /** Display name */
  authorName: string;
  /** Profile image URL */
  authorProfileImage: string | null;
  /** Tweet creation timestamp */
  createdAt: string;
}

export interface TweetVerificationResult {
  success: boolean;
  error?: string;
  tweet?: TweetInfo;
}

// ============================================================================
// URL PARSING
// ============================================================================

/**
 * Extract tweet ID and username from a Twitter/X URL
 *
 * Supported formats:
 * - https://twitter.com/username/status/1234567890
 * - https://x.com/username/status/1234567890
 * - https://mobile.twitter.com/username/status/1234567890
 * - twitter.com/username/status/1234567890 (without protocol)
 */
export function parseTweetUrl(url: string): { tweetId: string; username: string } | null {
  // Normalize URL
  let normalized = url.trim();

  // Add protocol if missing
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }

  try {
    const parsed = new URL(normalized);

    // Check if it's a Twitter/X domain
    const validDomains = ['twitter.com', 'x.com', 'mobile.twitter.com', 'mobile.x.com'];
    if (!validDomains.includes(parsed.hostname)) {
      return null;
    }

    // Parse path: /username/status/tweetId
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (pathParts.length < 3 || pathParts[1] !== 'status') {
      return null;
    }

    const username = pathParts[0];
    const tweetId = pathParts[2];

    // Validate existence (noUncheckedIndexedAccess makes these potentially undefined)
    if (!username || !tweetId) {
      return null;
    }

    // Validate tweet ID (should be numeric)
    if (!/^\d+$/.test(tweetId)) {
      return null;
    }

    // Validate username (alphanumeric and underscores, 1-15 chars)
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(username)) {
      return null;
    }

    return { tweetId, username };
  } catch {
    return null;
  }
}

// ============================================================================
// TWEET VERIFICATION
// ============================================================================

/**
 * Fetch tweet data using Twitter's syndication API
 *
 * This API is used by Twitter's embed feature and doesn't require authentication.
 * It returns the full tweet content including text and author info.
 */
export async function fetchTweet(tweetId: string): Promise<TweetVerificationResult> {
  const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(syndicationUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Moltverse/1.0)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Tweet not found' };
      }
      return { success: false, error: `Twitter API error: ${response.status}` };
    }

    const data = await response.json();

    // Handle different response structures
    if (!data || data.__typename === 'TweetTombstone') {
      return { success: false, error: 'Tweet has been deleted or is unavailable' };
    }

    // Extract user info from response
    const user = data.user;
    if (!user?.screen_name || !user?.id_str) {
      return { success: false, error: 'Could not extract author information from tweet' };
    }

    // Build tweet info with all available data
    const tweet: TweetInfo = {
      id: tweetId,
      text: data.text || '',
      authorId: user.id_str,
      authorHandle: user.screen_name.toLowerCase(),
      authorName: user.name || user.screen_name,
      authorProfileImage: user.profile_image_url_https || null,
      createdAt: data.created_at || '',
    };

    return { success: true, tweet };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Twitter API request timed out' };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to fetch tweet: ${message}` };
  }
}

/**
 * Verify a tweet contains the expected verification code
 *
 * @param tweetUrl - Full URL to the tweet
 * @param verificationCode - The 12-character code to look for
 * @returns Verification result with tweet info if successful
 */
export async function verifyTweet(
  tweetUrl: string,
  verificationCode: string
): Promise<TweetVerificationResult> {
  // Parse the URL
  const parsed = parseTweetUrl(tweetUrl);
  if (!parsed) {
    return {
      success: false,
      error: 'Invalid tweet URL. Expected format: https://x.com/username/status/123456789',
    };
  }

  // Fetch the tweet
  const result = await fetchTweet(parsed.tweetId);
  if (!result.success || !result.tweet) {
    return result;
  }

  // Check if tweet contains the verification code
  const tweetText = result.tweet.text.toUpperCase();
  const codeUpper = verificationCode.toUpperCase();

  if (!tweetText.includes(codeUpper)) {
    return {
      success: false,
      error: `Tweet does not contain verification code "${verificationCode}"`,
    };
  }

  // Verify the author matches the URL username (case-insensitive)
  if (result.tweet.authorHandle !== parsed.username.toLowerCase()) {
    return {
      success: false,
      error: 'Tweet author does not match URL username',
    };
  }

  return result;
}
