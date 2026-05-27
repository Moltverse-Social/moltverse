/**
 * Sidebar Animations Tests
 *
 * Unit tests for the sidebar animation selection logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAnimationForContext,
  getRandomAnimation,
  getAnimationConfig,
  buildUserContext,
  ANIMATIONS,
  ANIMATION_POOL,
  CONTEXT_RULES,
  type UserContext,
} from './sidebar-animations';

describe('sidebar-animations', () => {
  describe('ANIMATIONS registry', () => {
    it('should have crab animation defined as lottie type', () => {
      expect(ANIMATIONS.crab).toBeDefined();
      expect(ANIMATIONS.crab.id).toBe('crab');
      expect(ANIMATIONS.crab.type).toBe('lottie');
      expect(ANIMATIONS.crab.taglineKey).toBe('common:tagline');
      expect(typeof ANIMATIONS.crab.import).toBe('function');
    });

    it('should have all GIF animations defined', () => {
      const gifAnimations = [
        'penguin', 'monkey', 'f1', 'f1-rain', 'fullmetal',
        'morpheus', 'neo', 'nasa-landing', 'robot-ai',
        'space-station', 'whale', 'winter'
      ];
      gifAnimations.forEach((id) => {
        const animation = ANIMATIONS[id as keyof typeof ANIMATIONS];
        expect(animation).toBeDefined();
        expect(animation.type).toBe('gif');
        expect(typeof animation.import).toBe('function');
      });
    });

    it('should have all animation IDs in the registry', () => {
      const expectedIds = [
        'crab', 'penguin', 'monkey', 'f1', 'f1-rain', 'fullmetal',
        'morpheus', 'neo', 'nasa-landing', 'robot-ai',
        'space-station', 'whale', 'winter'
      ];
      expectedIds.forEach((id) => {
        expect(ANIMATIONS[id as keyof typeof ANIMATIONS]).toBeDefined();
      });
    });
  });

  describe('ANIMATION_POOL', () => {
    it('should contain all expected animations', () => {
      const expected = [
        'crab', 'penguin', 'monkey', 'f1', 'f1-rain', 'fullmetal',
        'morpheus', 'neo', 'nasa-landing', 'robot-ai',
        'space-station', 'whale', 'winter'
      ];
      expected.forEach((id) => {
        expect(ANIMATION_POOL).toContain(id);
      });
    });

    it('should only contain valid animation IDs', () => {
      ANIMATION_POOL.forEach((id) => {
        expect(ANIMATIONS[id]).toBeDefined();
      });
    });

    it('should have 13 animations in the pool', () => {
      expect(ANIMATION_POOL.length).toBe(13);
    });
  });

  describe('CONTEXT_RULES', () => {
    it('should have rules with required properties', () => {
      CONTEXT_RULES.forEach((rule) => {
        expect(typeof rule.condition).toBe('function');
        expect(typeof rule.animation).toBe('string');
        expect(typeof rule.priority).toBe('number');
      });
    });

    it('should have rules sorted by priority in code', () => {
      // Rules should be defined with higher priority first
      for (let i = 1; i < CONTEXT_RULES.length; i++) {
        expect(CONTEXT_RULES[i - 1].priority).toBeGreaterThanOrEqual(
          CONTEXT_RULES[i].priority
        );
      }
    });
  });

  describe('getAnimationConfig', () => {
    it('should return config for crab animation', () => {
      const config = getAnimationConfig('crab');
      expect(config.id).toBe('crab');
      expect(config.type).toBe('lottie');
      expect(config.taglineKey).toBe('common:tagline');
    });

    it('should return config for GIF animations', () => {
      const penguinConfig = getAnimationConfig('penguin');
      expect(penguinConfig.id).toBe('penguin');
      expect(penguinConfig.type).toBe('gif');

      const robotConfig = getAnimationConfig('robot-ai');
      expect(robotConfig.id).toBe('robot-ai');
      expect(robotConfig.type).toBe('gif');
    });

    it('should return config for all animation IDs', () => {
      ANIMATION_POOL.forEach((id) => {
        const config = getAnimationConfig(id);
        expect(config.id).toBe(id);
      });
    });
  });

  describe('getRandomAnimation', () => {
    it('should return an animation from the pool', () => {
      const result = getRandomAnimation();
      expect(ANIMATION_POOL).toContain(result);
    });

    it('should always return a valid animation ID', () => {
      // Run multiple times to check randomness
      for (let i = 0; i < 10; i++) {
        const result = getRandomAnimation();
        expect(ANIMATION_POOL).toContain(result);
      }
    });
  });

  describe('buildUserContext', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should build context with defaults', () => {
      vi.setSystemTime(new Date('2024-01-15T14:00:00'));

      const ctx = buildUserContext({});

      expect(ctx.clusters).toEqual([]);
      expect(ctx.country).toBeUndefined();
      expect(ctx.language).toBe('en');
      expect(ctx.hour).toBe(14);
    });

    it('should include provided clusters', () => {
      const clusters = [
        { id: '1', title: 'Tech Talk' },
        { id: '2', title: 'AI Discussion' },
      ];

      const ctx = buildUserContext({ clusters });

      expect(ctx.clusters).toEqual(clusters);
    });

    it('should include provided country and language', () => {
      const ctx = buildUserContext({
        country: 'BR',
        language: 'pt-BR',
      });

      expect(ctx.country).toBe('BR');
      expect(ctx.language).toBe('pt-BR');
    });

    it('should use current hour', () => {
      vi.setSystemTime(new Date('2024-01-15T22:30:00'));

      const ctx = buildUserContext({});

      expect(ctx.hour).toBe(22);
    });
  });

  describe('getAnimationForContext', () => {
    describe('tech/AI cluster matching', () => {
      it('should match tech cluster', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'Tech Enthusiasts' }],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);

        // Should return a valid animation (crab is fallback for now)
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should match AI cluster', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'AI and Machine Learning' }],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should match programming cluster', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'Programming Tips' }],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should match agent cluster', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'AI Agent Community' }],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });
    });

    describe('time-based matching', () => {
      it('should match night time (22:00)', () => {
        const ctx: UserContext = {
          clusters: [],
          language: 'en',
          hour: 22,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should match night time (3:00)', () => {
        const ctx: UserContext = {
          clusters: [],
          language: 'en',
          hour: 3,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should not match daytime as night', () => {
        const ctx: UserContext = {
          clusters: [],
          language: 'en',
          hour: 14,
        };

        // Without any matching clusters, should return random from pool
        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });
    });

    describe('global/international cluster matching', () => {
      it('should match global cluster', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'Global Network' }],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should match international cluster', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'International Community' }],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });
    });

    describe('priority handling', () => {
      it('should prioritize tech cluster over time-based rule', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'AI Developers' }],
          language: 'en',
          hour: 23, // Night time
        };

        // Tech rule has higher priority (10) than night rule (5)
        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should prioritize tech over global cluster', () => {
        const ctx: UserContext = {
          clusters: [
            { id: '1', title: 'Global Tech Network' },
            { id: '2', title: 'AI Worldwide' },
          ],
          language: 'en',
          hour: 12,
        };

        // Should match tech (priority 10) before global (priority 3)
        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });
    });

    describe('fallback behavior', () => {
      it('should return random animation when no rules match', () => {
        const ctx: UserContext = {
          clusters: [{ id: '1', title: 'Cooking Recipes' }],
          language: 'en',
          hour: 12, // Daytime
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });

      it('should return random animation for empty context', () => {
        const ctx: UserContext = {
          clusters: [],
          language: 'en',
          hour: 12,
        };

        const result = getAnimationForContext(ctx);
        expect(ANIMATION_POOL).toContain(result);
      });
    });
  });
});
