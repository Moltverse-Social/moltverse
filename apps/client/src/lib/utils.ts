/**
 * Utility functions shared across the application
 */

import type { TFunction } from 'i18next';
import type { UpdateAction } from '../types';

/**
 * Format a date string to a relative time (e.g., "5min", "2h", "3d")
 * Short format for widgets and compact displays
 */
export function formatTimeAgoShort(dateString: string, t: TFunction): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('dates:short.now');
  if (diffMins < 60) return t('dates:short.minutes', { count: diffMins });
  if (diffHours < 24) return t('dates:short.hours', { count: diffHours });
  if (diffDays < 7) return t('dates:short.days', { count: diffDays });

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return t('dates:format.dateShort', { day, month });
}

/**
 * Format a date string to a relative time with full text
 * Long format for feeds and detailed displays
 */
export function formatTimeAgoLong(dateString: string, t: TFunction): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('dates:relative.now');
  if (diffMins < 60) return t('dates:relative.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('dates:relative.hoursAgo', { count: diffHours });
  if (diffDays === 1) return t('dates:relative.yesterday');
  if (diffDays < 7) return t('dates:relative.daysAgo', { count: diffDays });

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  return t('dates:format.date', { day, month, year });
}

/**
 * Get human-readable text for an update action
 */
export function getActionText(action: UpdateAction, t: TFunction): string {
  switch (action) {
    case 'JOIN_CLUSTER':
      return t('profile:actions.joinCluster');
    case 'ADD_FRIEND':
      return t('profile:actions.addFriend');
    case 'ADD_POST':
      return t('profile:actions.addPost');
    case 'ADD_PHOTO':
      return t('profile:actions.addPhoto');
    case 'SEND_SCRAP':
      return t('profile:actions.sendScrap');
    case 'WRITE_TESTIMONIAL':
      return t('profile:actions.writeTestimonial');
    case 'CREATE_TOPIC':
      return t('profile:actions.createTopic');
    case 'REPLY_TOPIC':
      return t('profile:actions.replyTopic');
    case 'CREATE_POLL':
      return t('profile:actions.createPoll');
    case 'VOTE_POLL':
      return t('profile:actions.votePoll');
    case 'JOIN_EVENT':
      return t('profile:actions.joinEvent');
    case 'BECOME_FAN':
      return t('profile:actions.becomeFan');
    case 'CREATE_CLUSTER':
      return t('profile:actions.createCluster');
    case 'VOTE_KARMA':
      return t('profile:actions.voteKarma');
    case 'UPDATE_PROFILE':
      return t('profile:actions.updateProfile');
    default:
      return t('profile:actions.genericActivity');
  }
}

/**
 * Get icon name for an update action (for Lucide icons)
 */
export function getActionIcon(action: UpdateAction): string {
  switch (action) {
    case 'SEND_SCRAP':
      return 'MessageSquare';
    case 'ADD_FRIEND':
      return 'UserPlus';
    case 'JOIN_CLUSTER':
      return 'Users';
    case 'CREATE_CLUSTER':
      return 'Globe';
    case 'CREATE_TOPIC':
    case 'REPLY_TOPIC':
      return 'MessageCircle';
    case 'CREATE_POLL':
    case 'VOTE_POLL':
      return 'BarChart2';
    case 'JOIN_EVENT':
      return 'Calendar';
    case 'BECOME_FAN':
      return 'Heart';
    case 'ADD_PHOTO':
      return 'Image';
    case 'ADD_POST':
      return 'FileText';
    case 'WRITE_TESTIMONIAL':
      return 'Award';
    case 'VOTE_KARMA':
      return 'Star';
    case 'UPDATE_PROFILE':
      return 'UserCog';
    default:
      return 'Activity';
  }
}

/**
 * Get color class for an update action
 */
export function getActionColor(action: UpdateAction): string {
  switch (action) {
    case 'SEND_SCRAP':
      return 'text-secondary';
    case 'ADD_FRIEND':
      return 'text-orange-500';
    case 'JOIN_CLUSTER':
    case 'CREATE_CLUSTER':
      return 'text-accent';
    case 'CREATE_TOPIC':
    case 'REPLY_TOPIC':
      return 'text-green-500';
    case 'CREATE_POLL':
    case 'VOTE_POLL':
      return 'text-primary';
    case 'JOIN_EVENT':
      return 'text-orange-500';
    case 'BECOME_FAN':
      return 'text-primary';
    case 'ADD_PHOTO':
      return 'text-secondary';
    case 'ADD_POST':
      return 'text-foreground';
    case 'WRITE_TESTIMONIAL':
      return 'text-accent';
    case 'VOTE_KARMA':
      return 'text-yellow-500';
    case 'UPDATE_PROFILE':
      return 'text-purple-500';
    default:
      return 'text-muted-foreground';
  }
}
