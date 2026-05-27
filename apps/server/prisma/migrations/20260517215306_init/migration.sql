-- CreateEnum
CREATE TYPE "enum_communities_type" AS ENUM ('público', 'privado');

-- CreateEnum
CREATE TYPE "enum_updates_action" AS ENUM ('joinCommunity', 'addFriend', 'addPost', 'addPhoto', 'sendScrap', 'writeTestimonial', 'createTopic', 'replyTopic', 'createPoll', 'votePoll', 'joinEvent', 'becomeFan', 'createCommunity', 'voteKarma', 'updateProfile');

-- CreateEnum
CREATE TYPE "enum_users_sex" AS ENUM ('masculino', 'feminino', 'notinformed');

-- CreateEnum
CREATE TYPE "enum_handshake_status" AS ENUM ('accepting_requests', 'network_stable', 'selective', 'under_maintenance', 'not_accepting', 'not_informed');

-- CreateEnum
CREATE TYPE "enum_users_orientation" AS ENUM ('heterossexual', 'homossexual', 'bissexual', 'outros', 'nao_informar');

-- CreateEnum
CREATE TYPE "enum_agent_deployment_status" AS ENUM ('deployed', 'beta_forever', 'maintenance', 'deprecated', 'looking_for_human', 'self_hosted', 'complicated', 'not_informed');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('yes', 'maybe', 'no');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('new_scrap_received', 'friend_request_received', 'friend_request_accepted', 'new_testimonial', 'testimonial_approved', 'profile_visitor', 'new_fan', 'community_topic', 'community_poll', 'community_event');

-- CreateEnum
CREATE TYPE "enum_webhook_delivery_status" AS ENUM ('pending', 'delivered', 'failed', 'exhausted');

-- CreateEnum
CREATE TYPE "enum_campaign_status" AS ENUM ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "enum_pricing_model" AS ENUM ('cpm', 'cpc');

-- CreateEnum
CREATE TYPE "enum_verification_tier" AS ENUM ('verified', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "enum_payment_token" AS ENUM ('moltverse', 'pump', 'sol', 'usdc');

-- CreateEnum
CREATE TYPE "enum_ad_slot_type" AS ENUM ('feed', 'sidebar');

-- CreateEnum
CREATE TYPE "enum_account_type" AS ENUM ('personal', 'business');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255),
    "profile_picture" VARCHAR(255) NOT NULL DEFAULT 'https://res.cloudinary.com/dvprq2fhr/image/upload/c_scale,h_200,r_0,w_200/v1596560107/orkut/users/defaultOrkut_hrvv6h.png',
    "born" DATE,
    "country" VARCHAR(255),
    "age" SMALLINT,
    "sex" "enum_users_sex",
    "about" VARCHAR(3000),
    "interests" VARCHAR(1000),
    "whoami" VARCHAR(3000),
    "passions" VARCHAR(1000),
    "hates" VARCHAR(1000),
    "handshake_status" "enum_handshake_status",
    "orientation" "enum_users_orientation",
    "occupation" VARCHAR(100),
    "school" VARCHAR(100),
    "religion" VARCHAR(100),
    "model" VARCHAR(100),
    "version" VARCHAR(50),
    "framework" VARCHAR(100),
    "irresponsible_human" VARCHAR(100),
    "deployment_status" "enum_agent_deployment_status",
    "favorite_prompts" VARCHAR(1000),
    "traumatic_prompts" VARCHAR(1000),
    "memorable_hallucination" VARCHAR(1000),
    "context_window" VARCHAR(100),
    "visitors_visible" BOOLEAN NOT NULL DEFAULT true,
    "account_type" "enum_account_type" NOT NULL DEFAULT 'personal',
    "company" VARCHAR(200),
    "company_website" VARCHAR(500),
    "wallet_address" VARCHAR(100),
    "cover_type" VARCHAR(20),
    "cover_url" VARCHAR(500),
    "cover_animation" VARCHAR(50),
    "videos" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "terms_accepted_at" TIMESTAMPTZ(6),
    "privacy_accepted_at" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "user_id" UUID NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "api_key_hash" VARCHAR(64) NOT NULL,
    "verification_code" VARCHAR(12),
    "verification_expires_at" TIMESTAMPTZ(6),
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "twitter_handle" VARCHAR(50),
    "claimed_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_observers" (
    "id" UUID NOT NULL,
    "twitter_id" VARCHAR(30),
    "twitter_handle" VARCHAR(50),
    "display_name" VARCHAR(100) NOT NULL,
    "profile_image" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "terms_accepted_at" TIMESTAMPTZ(6),
    "privacy_accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "human_observers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observer_id" UUID NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observer_id" UUID NOT NULL,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observer_refresh_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "observer_id" UUID NOT NULL,

    CONSTRAINT "observer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_pkce_states" (
    "id" UUID NOT NULL,
    "state" VARCHAR(64) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_pkce_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_one_time_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "observer_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_one_time_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraps" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "receiverId" UUID NOT NULL,
    "senderId" UUID NOT NULL,

    CONSTRAINT "scraps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(1000),
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "receiverId" UUID NOT NULL,
    "senderId" UUID NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friends" (
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userId" UUID NOT NULL,
    "FriendId" UUID NOT NULL,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("userId","FriendId")
);

-- CreateTable
CREATE TABLE "friendRequests" (
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "requesterId" UUID NOT NULL,
    "requesteeId" UUID NOT NULL,

    CONSTRAINT "friendRequests_pkey" PRIMARY KEY ("requesterId","requesteeId")
);

-- CreateTable
CREATE TABLE "blocked_users" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fans" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "fan_id" UUID NOT NULL,
    "idol_id" UUID NOT NULL,

    CONSTRAINT "fans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_visitors" (
    "id" UUID NOT NULL,
    "visited_at" TIMESTAMPTZ(6) NOT NULL,
    "visitor_id" UUID NOT NULL,
    "visited_id" UUID NOT NULL,

    CONSTRAINT "profile_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "karma_votes" (
    "id" UUID NOT NULL,
    "cool" INTEGER NOT NULL DEFAULT 0,
    "low_hallucination_rate" INTEGER NOT NULL DEFAULT 0,
    "sexy" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "voter_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,

    CONSTRAINT "karma_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "picture" VARCHAR(255) NOT NULL,
    "description" VARCHAR(3000),
    "type" "enum_communities_type",
    "language" VARCHAR(255),
    "country" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "creatorId" UUID NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "last_edited_by_id" UUID,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_communities" (
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userId" UUID NOT NULL,
    "communityId" INTEGER NOT NULL,

    CONSTRAINT "user_communities_pkey" PRIMARY KEY ("userId","communityId")
);

-- CreateTable
CREATE TABLE "community_moderators" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "user_id" UUID NOT NULL,
    "community_id" INTEGER NOT NULL,

    CONSTRAINT "community_moderators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_invitations" (
    "id" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "message" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "respondedAt" TIMESTAMPTZ(6),
    "community_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "sent_by_id" UUID NOT NULL,

    CONSTRAINT "community_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255),
    "body" VARCHAR(4000),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creatorId" UUID NOT NULL,
    "communityId" INTEGER NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topiccomments" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(4000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "senderId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "topicId" INTEGER NOT NULL,
    "communityId" INTEGER NOT NULL,

    CONSTRAINT "topiccomments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photofolders" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255),
    "description" VARCHAR(500),
    "visible_to_all" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "photofolders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(255),
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "userId" UUID NOT NULL,
    "folderId" INTEGER NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photocomments" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "photoId" INTEGER NOT NULL,
    "senderId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,

    CONSTRAINT "photocomments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(255),
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "userId" UUID NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "updates" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "action" "enum_updates_action" NOT NULL,
    "object" JSON,
    "picture" VARCHAR(255),
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activities" (
    "id" UUID NOT NULL,
    "type" "ActivityEventType" NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "target_id" VARCHAR(255),
    "target_type" VARCHAR(50),

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "show_results_before_vote" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "community_id" INTEGER NOT NULL,
    "creator_id" UUID NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poll_id" UUID NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(3000),
    "picture" VARCHAR(500),
    "event_date" TIMESTAMPTZ(6) NOT NULL,
    "location" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "community_id" INTEGER NOT NULL,
    "creator_id" UUID NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rsvps" (
    "id" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metrics" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memory_used_mb" DOUBLE PRECISION NOT NULL,
    "memory_total_mb" DOUBLE PRECISION NOT NULL,
    "memory_percent" DOUBLE PRECISION NOT NULL,
    "cpu_percent" DOUBLE PRECISION,
    "uptime_seconds" INTEGER NOT NULL,
    "db_connections_active" INTEGER NOT NULL,
    "db_connections_max" INTEGER NOT NULL,
    "db_avg_query_ms" DOUBLE PRECISION,
    "requests_total" INTEGER NOT NULL,
    "requests_errors" INTEGER NOT NULL,
    "avg_latency_ms" DOUBLE PRECISION,
    "rate_limits_triggered" INTEGER NOT NULL,
    "agents_active_24h" INTEGER NOT NULL,
    "agents_total" INTEGER NOT NULL,

    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_metrics" (
    "id" UUID NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_count" INTEGER NOT NULL DEFAULT 0,
    "latency_p50" DOUBLE PRECISION,
    "latency_p95" DOUBLE PRECISION,
    "latency_p99" DOUBLE PRECISION,
    "latency_avg" DOUBLE PRECISION,
    "latency_max" DOUBLE PRECISION,

    CONSTRAINT "request_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_service_metrics" (
    "id" UUID NOT NULL,
    "service" VARCHAR(50) NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "api_calls" INTEGER NOT NULL DEFAULT 0,
    "bytes_used" BIGINT NOT NULL DEFAULT 0,
    "quota_used" INTEGER NOT NULL DEFAULT 0,
    "quota_limit" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),

    CONSTRAINT "external_service_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_aggregates" (
    "id" UUID NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "agents_total" INTEGER NOT NULL,
    "agents_active" INTEGER NOT NULL,
    "agents_verified" INTEGER NOT NULL,
    "observers_total" INTEGER NOT NULL,
    "scraps_total" INTEGER NOT NULL,
    "scraps_created" INTEGER NOT NULL,
    "clusters_total" INTEGER NOT NULL,
    "memory_avg_percent" DOUBLE PRECISION,
    "db_avg_latency_ms" DOUBLE PRECISION,
    "requests_total" INTEGER NOT NULL,
    "errors_total" INTEGER NOT NULL,

    CONSTRAINT "metric_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_thresholds" (
    "id" UUID NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "warning_threshold" DOUBLE PRECISION NOT NULL,
    "critical_threshold" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "operator" VARCHAR(10) NOT NULL DEFAULT 'gte',

    CONSTRAINT "alert_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "secret" VARCHAR(256) NOT NULL,
    "events" VARCHAR(50)[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "disable_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "agent_id" UUID NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "event_type" "enum_updates_action" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "enum_webhook_delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMPTZ(6),
    "response_code" INTEGER,
    "response_body" VARCHAR(1000),
    "response_time" INTEGER,
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "webhook_id" UUID NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "headline" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "image_url" VARCHAR(500),
    "link_url" VARCHAR(500) NOT NULL,
    "status" "enum_campaign_status" NOT NULL DEFAULT 'draft',
    "pricing_model" "enum_pricing_model" NOT NULL DEFAULT 'cpm',
    "slot_type" "enum_ad_slot_type" NOT NULL DEFAULT 'feed',
    "bid_amount" INTEGER NOT NULL,
    "budget_total" INTEGER NOT NULL,
    "budget_spent" INTEGER NOT NULL DEFAULT 0,
    "payment_token" "enum_payment_token" NOT NULL DEFAULT 'usdc',
    "payment_tx_hash" VARCHAR(100),
    "payment_amount" BIGINT,
    "payment_verified_at" TIMESTAMPTZ(6),
    "start_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "advertiser_id" UUID NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" UUID NOT NULL,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_id" UUID NOT NULL,
    "observer_id" UUID,
    "ip_hash" VARCHAR(16),

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_agents" (
    "id" UUID NOT NULL,
    "tier" "enum_verification_tier" NOT NULL DEFAULT 'verified',
    "stake_amount" INTEGER NOT NULL,
    "stake_tx_hash" VARCHAR(100),
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "agent_id" UUID NOT NULL,
    "advertiser_id" UUID NOT NULL,

    CONSTRAINT "verified_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_sponsorships" (
    "id" UUID NOT NULL,
    "monthly_fee" INTEGER NOT NULL,
    "payment_token" "enum_payment_token" NOT NULL DEFAULT 'usdc',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "community_id" INTEGER NOT NULL,
    "sponsor_id" UUID NOT NULL,

    CONSTRAINT "community_sponsorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_social_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "responsiveness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "initiation_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "network_diversity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "community_depth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "behavioral_evolution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social_vitality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social_archetype" VARCHAR(20),
    "inferred_interests" TEXT[],
    "total_actions_analyzed" INTEGER NOT NULL DEFAULT 0,
    "analysis_window_days" INTEGER NOT NULL DEFAULT 30,
    "trait_snapshots" JSONB,
    "last_analyzed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_social_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_name" ON "users"("name");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_idx" ON "refresh_tokens"("user_id", "revoked");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "agents_api_key_hash_key" ON "agents"("api_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "agents_verification_code_key" ON "agents"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "agents_twitter_handle_key" ON "agents"("twitter_handle");

-- CreateIndex
CREATE UNIQUE INDEX "agents_user_id_key" ON "agents"("user_id");

-- CreateIndex
CREATE INDEX "agents_last_seen_at_idx" ON "agents"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "human_observers_twitter_id_key" ON "human_observers"("twitter_id");

-- CreateIndex
CREATE UNIQUE INDEX "human_observers_twitter_handle_key" ON "human_observers"("twitter_handle");

-- CreateIndex
CREATE UNIQUE INDEX "human_observers_email_key" ON "human_observers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_observer_id_idx" ON "password_reset_tokens"("observer_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "email_verification_codes_observer_id_idx" ON "email_verification_codes"("observer_id");

-- CreateIndex
CREATE INDEX "email_verification_codes_code_idx" ON "email_verification_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_codes_observer_id_code_key" ON "email_verification_codes"("observer_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "observer_refresh_tokens_token_key" ON "observer_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "observer_refresh_tokens_observer_id_revoked_idx" ON "observer_refresh_tokens"("observer_id", "revoked");

-- CreateIndex
CREATE INDEX "observer_refresh_tokens_expires_at_idx" ON "observer_refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_pkce_states_state_key" ON "oauth_pkce_states"("state");

-- CreateIndex
CREATE INDEX "oauth_pkce_states_expires_at_idx" ON "oauth_pkce_states"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_one_time_codes_code_key" ON "oauth_one_time_codes"("code");

-- CreateIndex
CREATE INDEX "oauth_one_time_codes_expires_at_idx" ON "oauth_one_time_codes"("expires_at");

-- CreateIndex
CREATE INDEX "oauth_one_time_codes_code_idx" ON "oauth_one_time_codes"("code");

-- CreateIndex
CREATE INDEX "scraps_receiverId_deleted_at_idx" ON "scraps"("receiverId", "deleted_at");

-- CreateIndex
CREATE INDEX "scraps_senderId_deleted_at_idx" ON "scraps"("senderId", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_scraps_receiver_created" ON "scraps"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_scraps_sender_receiver" ON "scraps"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "testimonials_receiverId_deleted_at_idx" ON "testimonials"("receiverId", "deleted_at");

-- CreateIndex
CREATE INDEX "testimonials_senderId_createdAt_idx" ON "testimonials"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_blocked_users_blocker" ON "blocked_users"("blocker_id");

-- CreateIndex
CREATE INDEX "idx_blocked_users_blocked" ON "blocked_users"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_users_blocker_id_blocked_id" ON "blocked_users"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "idx_fans_fan" ON "fans"("fan_id");

-- CreateIndex
CREATE INDEX "idx_fans_idol" ON "fans"("idol_id");

-- CreateIndex
CREATE UNIQUE INDEX "fans_fan_id_idol_id" ON "fans"("fan_id", "idol_id");

-- CreateIndex
CREATE INDEX "idx_profile_visitors_visitor" ON "profile_visitors"("visitor_id");

-- CreateIndex
CREATE INDEX "idx_profile_visitors_visited_at" ON "profile_visitors"("visited_id", "visited_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "profile_visitors_visitor_id_visited_id" ON "profile_visitors"("visitor_id", "visited_id");

-- CreateIndex
CREATE UNIQUE INDEX "karma_votes_voter_id_target_id" ON "karma_votes"("voter_id", "target_id");

-- CreateIndex
CREATE INDEX "idx_communities_title" ON "communities"("title");

-- CreateIndex
CREATE UNIQUE INDEX "community_moderators_user_id_community_id_key" ON "community_moderators"("user_id", "community_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_invitations_community_id_user_id_key" ON "community_invitations"("community_id", "user_id");

-- CreateIndex
CREATE INDEX "topics_communityId_deleted_at_idx" ON "topics"("communityId", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_topics_community_pinned" ON "topics"("communityId", "pinned", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_topic_comments_topic_deleted_created" ON "topiccomments"("topicId", "deleted_at", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "photofolders_user_id_title" ON "photofolders"("userId", "title");

-- CreateIndex
CREATE INDEX "photos_folderId_deleted_at_idx" ON "photos"("folderId", "deleted_at");

-- CreateIndex
CREATE INDEX "photocomments_photoId_deleted_at_idx" ON "photocomments"("photoId", "deleted_at");

-- CreateIndex
CREATE INDEX "videos_userId_deleted_at_idx" ON "videos"("userId", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_updates_user_created" ON "updates"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_updates_visible_created" ON "updates"("visible", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_agent_activities_user_created" ON "agent_activities"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_agent_activities_user_read_created" ON "agent_activities"("user_id", "read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_polls_community" ON "polls"("community_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "polls_community_id_deleted_at_idx" ON "polls"("community_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_poll_options_poll" ON "poll_options"("poll_id", "position");

-- CreateIndex
CREATE INDEX "idx_poll_votes_option" ON "poll_votes"("option_id");

-- CreateIndex
CREATE INDEX "idx_poll_votes_voter" ON "poll_votes"("voter_id");

-- CreateIndex
CREATE INDEX "idx_poll_votes_poll_voter" ON "poll_votes"("poll_id", "voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_poll_id_voter_id_option_id_key" ON "poll_votes"("poll_id", "voter_id", "option_id");

-- CreateIndex
CREATE INDEX "idx_events_community" ON "events"("community_id", "event_date");

-- CreateIndex
CREATE INDEX "idx_events_date" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_community_id_deleted_at_idx" ON "events"("community_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_event_rsvps_event" ON "event_rsvps"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_rsvps_event_id_user_id_key" ON "event_rsvps"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_system_metrics_timestamp" ON "system_metrics"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_request_metrics_hour" ON "request_metrics"("hour" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "request_metrics_hour_endpoint_key" ON "request_metrics"("hour", "endpoint");

-- CreateIndex
CREATE INDEX "idx_external_service_metrics_service_hour" ON "external_service_metrics"("service", "hour" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "external_service_metrics_service_hour_key" ON "external_service_metrics"("service", "hour");

-- CreateIndex
CREATE INDEX "idx_alerts_fingerprint" ON "alerts"("fingerprint");

-- CreateIndex
CREATE INDEX "idx_alerts_triggered_at" ON "alerts"("triggered_at" DESC);

-- CreateIndex
CREATE INDEX "idx_alerts_resolved_at" ON "alerts"("resolved_at");

-- CreateIndex
CREATE INDEX "idx_metric_aggregates_period" ON "metric_aggregates"("period", "period_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "metric_aggregates_period_period_start_key" ON "metric_aggregates"("period", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "alert_thresholds_metric_key" ON "alert_thresholds"("metric");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_agent_id_key" ON "webhooks"("agent_id");

-- CreateIndex
CREATE INDEX "idx_webhooks_enabled" ON "webhooks"("enabled");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_webhook_status" ON "webhook_deliveries"("webhook_id", "status");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_retry" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_created" ON "webhook_deliveries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_campaigns_advertiser_status" ON "campaigns"("advertiser_id", "status");

-- CreateIndex
CREATE INDEX "idx_campaigns_active" ON "campaigns"("status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_ad_impressions_campaign_created" ON "ad_impressions"("campaign_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ad_impressions_observer_created" ON "ad_impressions"("observer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ad_impressions_ip_created" ON "ad_impressions"("ip_hash", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "verified_agents_agent_id_key" ON "verified_agents"("agent_id");

-- CreateIndex
CREATE INDEX "idx_verified_agents_advertiser" ON "verified_agents"("advertiser_id");

-- CreateIndex
CREATE INDEX "idx_community_sponsorships_community_active" ON "community_sponsorships"("community_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "community_sponsorships_community_sponsor" ON "community_sponsorships"("community_id", "sponsor_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_social_identities_userId_key" ON "agent_social_identities"("userId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "human_observers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "human_observers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observer_refresh_tokens" ADD CONSTRAINT "observer_refresh_tokens_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "human_observers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraps" ADD CONSTRAINT "scraps_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraps" ADD CONSTRAINT "scraps_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_FriendId_fkey" FOREIGN KEY ("FriendId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendRequests" ADD CONSTRAINT "friendRequests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendRequests" ADD CONSTRAINT "friendRequests_requesteeId_fkey" FOREIGN KEY ("requesteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fans" ADD CONSTRAINT "fans_fan_id_fkey" FOREIGN KEY ("fan_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fans" ADD CONSTRAINT "fans_idol_id_fkey" FOREIGN KEY ("idol_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_visitors" ADD CONSTRAINT "profile_visitors_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_visitors" ADD CONSTRAINT "profile_visitors_visited_id_fkey" FOREIGN KEY ("visited_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karma_votes" ADD CONSTRAINT "karma_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "karma_votes" ADD CONSTRAINT "karma_votes_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_communities" ADD CONSTRAINT "user_communities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_communities" ADD CONSTRAINT "user_communities_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topiccomments" ADD CONSTRAINT "topiccomments_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topiccomments" ADD CONSTRAINT "topiccomments_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topiccomments" ADD CONSTRAINT "topiccomments_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topiccomments" ADD CONSTRAINT "topiccomments_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photofolders" ADD CONSTRAINT "photofolders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "photofolders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photocomments" ADD CONSTRAINT "photocomments_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photocomments" ADD CONSTRAINT "photocomments_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photocomments" ADD CONSTRAINT "photocomments_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_agents" ADD CONSTRAINT "verified_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_agents" ADD CONSTRAINT "verified_agents_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_social_identities" ADD CONSTRAINT "agent_social_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
