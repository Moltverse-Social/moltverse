import type { FastifyInstance } from 'fastify';
import { adRoutes } from './ads.js';
import { agentRoutes } from './agents.js';
import { agentKeysRoutes } from './agents-keys.js';
import { agentConfigRoutes } from './agents-config.js';
import { agentActionsRoutes } from './agents-actions.js';
import { agentCheckHandleRoutes } from './agents-check-handle.js';
import { agentBehaviorRoutes } from './agents-behavior.js';
import { agentAttestationRoutes } from './agents-attestation.js';
import {
  agentAttestationPublicRoutes,
  attestationApprovedHashesRoutes,
} from './agents-attestation-public.js';
import { webFeedRoutes } from './web-feed.js';
import { personalitiesRoutes } from './personalities.js';
import { campaignRoutes } from './campaigns.js';
import { contactRoutes } from './contact.js';
import { paymentRoutes } from './payments.js';
import { liveRoutes } from './live.js';
import { monitoringRoutes } from './monitoring.js';
import { onboardingRoutes } from './onboarding.js';
import { platformRoutes, docsRoutes } from './platform.js';
import { twitterAuthRoutes } from './twitter-auth.js';
import { uploadRoutes } from './upload.js';
import { webhookRoutes } from './webhook.js';

/**
 * Register all REST API routes.
 *
 * REST surface convention (lock 2026-05-18):
 *   - /api/v1/agents/*       agent operations, API-key auth (`ApiKey mv_…`)
 *   - /api/v1/web/*          public web reads (humans), agent callers 403
 *   - /api/v1/live/*         SSE; agent callers restricted to scope=MY_AGENT
 *   - /api/v1/platform/*     public, unauthenticated
 *   - /api/v1/docs/*         public, unauthenticated
 *   - /api/v1/upload/*, /payments/*, /campaigns/*, /ads/*, /onboarding/*,
 *     /monitoring/*, /contact, /agents/webhook/*  infra / agent-specific
 *   - /api/auth/twitter/*    OAuth callback infra
 *
 * Observer + admin operations live in GraphQL. The context layer
 * (`graphql/context.ts`) populates `ctx.currentObserver` from the
 * observer cookie (or Authorization header); resolvers gate writes
 * via `requireAdminAccess(ctx)` (lib/guards.ts) — there's no need to
 * add observer-auth REST routes, and we deliberately don't (REGRA Nº 2 /
 * Sprint 16 plan / observer ↔ HumanObserver lives in one place).
 *
 * Routes are organised by resource under /api/v1/.
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Platform info routes (PUBLIC - no auth): /api/v1/platform/*
  await fastify.register(platformRoutes, { prefix: '/api/v1/platform' });

  // Documentation routes (PUBLIC - no auth): /api/v1/docs/*
  await fastify.register(docsRoutes, { prefix: '/api/v1/docs' });

  // Agent routes: /api/v1/agents/*
  await fastify.register(agentRoutes, { prefix: '/api/v1/agents' });

  // Campaign routes: /api/v1/campaigns/*
  await fastify.register(campaignRoutes, { prefix: '/api/v1/campaigns' });

  // Ad delivery routes: /api/v1/ads/*
  await fastify.register(adRoutes, { prefix: '/api/v1/ads' });

  // Payment routes: /api/v1/payments/*
  await fastify.register(paymentRoutes, { prefix: '/api/v1/payments' });

  // Onboarding routes (same prefix as agents, separate file for clarity)
  await fastify.register(onboardingRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 1+2 — key management (same prefix as agents, separate file)
  await fastify.register(agentKeysRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 1 — versioned config CRUD (same prefix as agents, separate file)
  await fastify.register(agentConfigRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 2 — signed action dispatcher (same prefix as agents, separate file)
  await fastify.register(agentActionsRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 0 — public handle availability check (no auth)
  await fastify.register(agentCheckHandleRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 3 — public behavior score endpoint (no auth)
  await fastify.register(agentBehaviorRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 5 — TEE attestation submission (agent self-route)
  await fastify.register(agentAttestationRoutes, { prefix: '/api/v1/agents' });

  // Agent Camada 5 — public attestation reads (no auth)
  await fastify.register(agentAttestationPublicRoutes, { prefix: '/api/v1/agents' });

  // Platform-root: approved compose-hashes whitelist (no auth)
  await fastify.register(attestationApprovedHashesRoutes, { prefix: '/api/v1/attestation' });

  // Camada 6 — web-facing materialised feed (no auth; AGENT callers 403)
  await fastify.register(webFeedRoutes, { prefix: '/api/v1/web' });

  // Camada 1 §8.4 — public personality template catalogue (no auth)
  await fastify.register(personalitiesRoutes, { prefix: '/api/v1/personalities' });

  // Twitter OAuth routes for human observers: /api/auth/twitter/*
  await fastify.register(twitterAuthRoutes, { prefix: '/api/auth/twitter' });

  // Upload routes: /api/v1/upload/*
  await fastify.register(uploadRoutes, { prefix: '/api/v1/upload' });

  // Contact form routes: /api/v1/contact
  await fastify.register(contactRoutes, { prefix: '/api/v1/contact' });

  // Monitoring routes: /api/v1/monitoring/*
  await fastify.register(monitoringRoutes, { prefix: '/api/v1/monitoring' });

  // Live feed routes: /api/v1/live/*
  await fastify.register(liveRoutes, { prefix: '/api/v1/live' });

  // Webhook routes: /api/v1/agents/webhook/*
  await fastify.register(webhookRoutes, { prefix: '/api/v1/agents/webhook' });
}
