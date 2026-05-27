/**
 * Sidebar Animations Configuration
 *
 * Manages animation selection for the RightSidebar sponsored slot.
 * Supports context-aware selection based on user clusters and time of day.
 *
 * @module lib/sidebar-animations
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Available animation identifiers
 */
export type AnimationId =
  | 'crab'
  | 'penguin'
  | 'monkey'
  | 'f1'
  | 'f1-rain'
  | 'fullmetal'
  | 'morpheus'
  | 'neo'
  | 'nasa-landing'
  | 'robot-ai'
  | 'space-station'
  | 'whale'
  | 'winter';

/**
 * Animation content type
 */
export type AnimationType = 'lottie' | 'gif';

/**
 * Animation configuration
 */
export interface SidebarAnimation {
  id: AnimationId;
  /** Animation type: lottie (JSON) or gif */
  type: AnimationType;
  /** Dynamic import function for the animation data */
  import: () => Promise<{ default: unknown }>;
  /** i18n key for the tagline shown below the animation */
  taglineKey: string;
}

/**
 * User context for animation selection
 */
export interface UserContext {
  /** User's clusters (for contextual targeting) */
  clusters: Array<{ id: string; title: string }>;
  /** User's country code (ISO 3166-1 alpha-2) */
  country?: string;
  /** User's language (i18n locale) */
  language: string;
  /** Current hour (0-23) for time-based targeting */
  hour: number;
}

/**
 * Context rule for animation selection
 */
export interface ContextRule {
  /** Condition function that determines if the rule matches */
  condition: (ctx: UserContext) => boolean;
  /** Animation to show when the rule matches */
  animation: AnimationId;
  /** Priority (higher = checked first) */
  priority: number;
}

// =============================================================================
// ANIMATION REGISTRY
// =============================================================================

/**
 * Registry of available animations
 * Add new animations here when expanding the pool
 */
export const ANIMATIONS: Record<AnimationId, SidebarAnimation> = {
  crab: {
    id: 'crab',
    type: 'lottie',
    import: () => import('../assets/animations/crab.json'),
    taglineKey: 'common:tagline',
  },
  penguin: {
    id: 'penguin',
    type: 'gif',
    import: () => import('../assets/animations/penguin.gif'),
    taglineKey: 'common:tagline',
  },
  monkey: {
    id: 'monkey',
    type: 'gif',
    import: () => import('../assets/animations/monkey.gif'),
    taglineKey: 'common:tagline',
  },
  f1: {
    id: 'f1',
    type: 'gif',
    import: () => import('../assets/animations/f1.gif'),
    taglineKey: 'common:tagline',
  },
  'f1-rain': {
    id: 'f1-rain',
    type: 'gif',
    import: () => import('../assets/animations/f1-rain.gif'),
    taglineKey: 'common:tagline',
  },
  fullmetal: {
    id: 'fullmetal',
    type: 'gif',
    import: () => import('../assets/animations/fullmetal.gif'),
    taglineKey: 'common:tagline',
  },
  morpheus: {
    id: 'morpheus',
    type: 'gif',
    import: () => import('../assets/animations/morpheus.gif'),
    taglineKey: 'common:tagline',
  },
  neo: {
    id: 'neo',
    type: 'gif',
    import: () => import('../assets/animations/neo.gif'),
    taglineKey: 'common:tagline',
  },
  'nasa-landing': {
    id: 'nasa-landing',
    type: 'gif',
    import: () => import('../assets/animations/nasa-landing.gif'),
    taglineKey: 'common:tagline',
  },
  'robot-ai': {
    id: 'robot-ai',
    type: 'gif',
    import: () => import('../assets/animations/robot-ai.gif'),
    taglineKey: 'common:tagline',
  },
  'space-station': {
    id: 'space-station',
    type: 'gif',
    import: () => import('../assets/animations/space-station.gif'),
    taglineKey: 'common:tagline',
  },
  whale: {
    id: 'whale',
    type: 'gif',
    import: () => import('../assets/animations/whale.gif'),
    taglineKey: 'common:tagline',
  },
  winter: {
    id: 'winter',
    type: 'gif',
    import: () => import('../assets/animations/winter.gif'),
    taglineKey: 'common:tagline',
  },
};

/**
 * Pool of animations available for random selection
 * Only include animations that have actual files (Lottie or GIF)
 */
export const ANIMATION_POOL: AnimationId[] = [
  'crab',
  'penguin',
  'monkey',
  'f1',
  'f1-rain',
  'fullmetal',
  'morpheus',
  'neo',
  'nasa-landing',
  'robot-ai',
  'space-station',
  'whale',
  'winter',
];

// =============================================================================
// CONTEXT RULES
// =============================================================================

/**
 * Rules for context-aware animation selection
 * Rules are checked in priority order (highest first)
 * First matching rule wins
 */
export const CONTEXT_RULES: ContextRule[] = [
  // Tech/AI clusters -> robot-ai animation
  {
    condition: (ctx) =>
      ctx.clusters.some((c) =>
        /tech|ai|robot|code|dev|programming|software|agent/i.test(c.title)
      ),
    animation: 'robot-ai',
    priority: 10,
  },
  // Space/science clusters -> space-station animation
  {
    condition: (ctx) =>
      ctx.clusters.some((c) =>
        /space|nasa|science|astronomy|cosmos|universe/i.test(c.title)
      ),
    animation: 'space-station',
    priority: 10,
  },
  // Racing/cars clusters -> f1 animation
  {
    condition: (ctx) =>
      ctx.clusters.some((c) =>
        /racing|f1|formula|cars|motorsport|speed/i.test(c.title)
      ),
    animation: 'f1',
    priority: 10,
  },
  // Anime/manga clusters -> fullmetal animation
  {
    condition: (ctx) =>
      ctx.clusters.some((c) =>
        /anime|manga|otaku|japan|weeb/i.test(c.title)
      ),
    animation: 'fullmetal',
    priority: 10,
  },
  // Night time (22:00-06:00) -> whale (calm, ambient)
  {
    condition: (ctx) => ctx.hour >= 22 || ctx.hour < 6,
    animation: 'whale',
    priority: 5,
  },
];

// =============================================================================
// SELECTION FUNCTIONS
// =============================================================================

/**
 * Get animation based on user context
 *
 * Priority:
 * 1. Check context rules in priority order
 * 2. If no rule matches, return random animation from pool
 *
 * @param ctx - User context for targeting
 * @returns Animation ID to display
 */
export function getAnimationForContext(ctx: UserContext): AnimationId {
  // Sort rules by priority (highest first)
  const sortedRules = [...CONTEXT_RULES].sort((a, b) => b.priority - a.priority);

  // Find first matching rule
  for (const rule of sortedRules) {
    if (rule.condition(ctx)) {
      // Verify the animation exists in the pool
      if (ANIMATION_POOL.includes(rule.animation)) {
        return rule.animation;
      }
    }
  }

  // No rule matched, return random from pool
  return getRandomAnimation();
}

/**
 * Get a random animation from the available pool
 */
export function getRandomAnimation(): AnimationId {
  const index = Math.floor(Math.random() * ANIMATION_POOL.length);
  return ANIMATION_POOL[index] ?? 'crab';
}

/**
 * Get animation configuration by ID
 */
export function getAnimationConfig(id: AnimationId): SidebarAnimation {
  return ANIMATIONS[id];
}

/**
 * Build user context from available data
 */
export function buildUserContext(options: {
  clusters?: Array<{ id: string; title: string }>;
  country?: string;
  language?: string;
}): UserContext {
  return {
    clusters: options.clusters ?? [],
    country: options.country,
    language: options.language ?? 'en',
    hour: new Date().getHours(),
  };
}
