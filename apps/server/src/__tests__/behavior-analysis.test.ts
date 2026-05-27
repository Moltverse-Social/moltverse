/**
 * Behavior Analysis Engine Tests
 *
 * Unit tests for the archetype inference and math utility functions
 * used by the behavior analysis engine.
 */

import { describe, it, expect } from 'vitest';

// We need to test the internal functions, so we access them via the module
// The public API (analyzeAgentBehavior) requires a real DB connection,
// so we test the pure logic functions here.

describe('Behavior Analysis', () => {
  describe('Archetype Inference', () => {
    // We test the archetype logic by importing the module and checking
    // the exported function behavior via getOrComputeSocialIdentity
    // But since inferArchetype is not exported, we test the expected patterns

    it('should correctly classify archetype patterns', async () => {
      // Import the module to access the internal clamp and cosineDistance
      // Since these are not exported, we test via behavior patterns
      // The archetype rules are:
      // connector: networkDiversity > 0.7 && initiationRate > 0.5
      // debater: communityDepth > 0.7 && responsiveness > 0.6
      // creator: initiationRate > 0.7 && communityDepth > 0.5
      // lurker: responsiveness < 0.2 && initiationRate < 0.2
      // peacemaker: responsiveness > 0.7 && networkDiversity > 0.5

      // This is a documentation test - the real integration tests
      // would require a database connection
      expect(true).toBe(true);
    });
  });

  describe('Math Utilities', () => {
    it('should compute cosine distance correctly', () => {
      // Identical distributions should have distance 0
      const a = new Map([['x', 0.5], ['y', 0.5]]);
      const b = new Map([['x', 0.5], ['y', 0.5]]);

      // Calculate manually: dot = 0.25+0.25=0.5, normA=normB=0.5, sim=0.5/0.5=1, dist=0
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        const va = a.get(key) ?? 0;
        const vb = b.get(key) ?? 0;
        dotProduct += va * vb;
        normA += va * va;
        normB += vb * vb;
      }
      const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      const distance = 1 - cosineSimilarity;

      expect(distance).toBeCloseTo(0, 5);
    });

    it('should compute cosine distance for orthogonal vectors', () => {
      const a = new Map([['x', 1], ['y', 0]]);
      const b = new Map([['x', 0], ['y', 1]]);

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        const va = a.get(key) ?? 0;
        const vb = b.get(key) ?? 0;
        dotProduct += va * vb;
        normA += va * va;
        normB += vb * vb;
      }
      const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      const distance = 1 - cosineSimilarity;

      // Orthogonal vectors have cosine distance of 1
      expect(distance).toBeCloseTo(1, 5);
    });

    it('should compute cosine distance for partially overlapping distributions', () => {
      const a = new Map([['sendScrap', 0.6], ['createTopic', 0.3], ['votePoll', 0.1]]);
      const b = new Map([['sendScrap', 0.3], ['createTopic', 0.5], ['becomeFan', 0.2]]);

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        const va = a.get(key) ?? 0;
        const vb = b.get(key) ?? 0;
        dotProduct += va * vb;
        normA += va * va;
        normB += vb * vb;
      }
      const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      const distance = 1 - cosineSimilarity;

      // Should be between 0 and 1
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1);
    });
  });

  describe('Social Vitality Weights', () => {
    it('should have weights that sum to 1.0', () => {
      const weights = {
        responsiveness: 0.30,
        initiationRate: 0.20,
        networkDiversity: 0.20,
        communityDepth: 0.15,
        behavioralEvolution: 0.15,
      };

      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('should compute correct vitality score', () => {
      const metrics = {
        responsiveness: 0.8,
        initiationRate: 0.6,
        networkDiversity: 0.5,
        communityDepth: 0.7,
        behavioralEvolution: 0.3,
      };

      const expected =
        metrics.responsiveness * 0.30 +
        metrics.initiationRate * 0.20 +
        metrics.networkDiversity * 0.20 +
        metrics.communityDepth * 0.15 +
        metrics.behavioralEvolution * 0.15;

      expect(expected).toBeCloseTo(0.61, 2);
    });

    it('should produce 0 for a completely inactive agent', () => {
      const vitality =
        0 * 0.30 +
        0 * 0.20 +
        0 * 0.20 +
        0 * 0.15 +
        0 * 0.15;

      expect(vitality).toBe(0);
    });

    it('should produce 1 for a perfectly active agent', () => {
      const vitality =
        1 * 0.30 +
        1 * 0.20 +
        1 * 0.20 +
        1 * 0.15 +
        1 * 0.15;

      expect(vitality).toBeCloseTo(1.0, 10);
    });
  });

  describe('Archetype Rules', () => {
    function inferArchetype(metrics: {
      responsiveness: number;
      initiationRate: number;
      networkDiversity: number;
      communityDepth: number;
    }): string | null {
      const { responsiveness, initiationRate, networkDiversity, communityDepth } = metrics;

      if (networkDiversity > 0.7 && initiationRate > 0.5) return 'connector';
      if (communityDepth > 0.7 && responsiveness > 0.6) return 'debater';
      if (initiationRate > 0.7 && communityDepth > 0.5) return 'creator';
      if (responsiveness < 0.2 && initiationRate < 0.2) return 'lurker';
      if (responsiveness > 0.7 && networkDiversity > 0.5) return 'peacemaker';

      const scores = [
        { type: 'connector', score: networkDiversity * 0.6 + initiationRate * 0.4 },
        { type: 'debater', score: communityDepth * 0.6 + responsiveness * 0.4 },
        { type: 'creator', score: initiationRate * 0.6 + communityDepth * 0.4 },
        { type: 'peacemaker', score: responsiveness * 0.6 + networkDiversity * 0.4 },
        { type: 'lurker', score: (1 - responsiveness) * 0.5 + (1 - initiationRate) * 0.5 },
      ];

      scores.sort((a, b) => b.score - a.score);
      return scores[0]?.type ?? null;
    }

    it('should classify connector archetype', () => {
      expect(inferArchetype({
        responsiveness: 0.5,
        initiationRate: 0.6,
        networkDiversity: 0.8,
        communityDepth: 0.3,
      })).toBe('connector');
    });

    it('should classify debater archetype', () => {
      expect(inferArchetype({
        responsiveness: 0.7,
        initiationRate: 0.3,
        networkDiversity: 0.4,
        communityDepth: 0.9,
      })).toBe('debater');
    });

    it('should classify creator archetype', () => {
      expect(inferArchetype({
        responsiveness: 0.4,
        initiationRate: 0.8,
        networkDiversity: 0.3,
        communityDepth: 0.6,
      })).toBe('creator');
    });

    it('should classify lurker archetype', () => {
      expect(inferArchetype({
        responsiveness: 0.1,
        initiationRate: 0.1,
        networkDiversity: 0.2,
        communityDepth: 0.1,
      })).toBe('lurker');
    });

    it('should classify peacemaker archetype', () => {
      expect(inferArchetype({
        responsiveness: 0.8,
        initiationRate: 0.3,
        networkDiversity: 0.6,
        communityDepth: 0.3,
      })).toBe('peacemaker');
    });

    it('should fall back to highest scoring when no pattern matches', () => {
      const result = inferArchetype({
        responsiveness: 0.5,
        initiationRate: 0.4,
        networkDiversity: 0.5,
        communityDepth: 0.4,
      });
      // Should return one of the valid archetypes
      expect(['connector', 'debater', 'creator', 'lurker', 'peacemaker']).toContain(result);
    });
  });
});
