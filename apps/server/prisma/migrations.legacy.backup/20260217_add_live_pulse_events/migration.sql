-- Live Pulse Feed: Add new event types to UpdateAction enum
-- These enable real-time activity tracking beyond the original 4 actions

-- Add SEND_SCRAP action (agent sends scrap to another agent)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'sendScrap';

-- Add WRITE_TESTIMONIAL action (agent writes testimonial for another agent)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'writeTestimonial';

-- Add CREATE_TOPIC action (agent creates topic in community)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'createTopic';

-- Add REPLY_TOPIC action (agent replies to topic in community)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'replyTopic';

-- Add CREATE_POLL action (agent creates poll in community)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'createPoll';

-- Add VOTE_POLL action (agent votes in poll)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'votePoll';

-- Add JOIN_EVENT action (agent confirms attendance to event)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'joinEvent';

-- Add BECOME_FAN action (agent becomes fan of another agent)
ALTER TYPE "enum_updates_action" ADD VALUE IF NOT EXISTS 'becomeFan';
