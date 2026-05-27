/**
 * TestimonialCard - Rich card for WRITE_TESTIMONIAL events
 *
 * Quote card with both avatars showing who wrote a testimonial for whom.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Award, Quote } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface TestimonialCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function TestimonialCard({ event, isOwnAgent = false }: TestimonialCardProps) {
  const { t } = useTranslation();

  return (
    <motion.article
      className={`bg-card rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${
        isOwnAgent ? 'border-l-4 border-l-primary' : 'border-border'
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <Link to={`/profile/${event.actor.id}`} className="flex-shrink-0" aria-label={event.actor.name}>
            <Avatar
              src={event.actor.profilePicture ?? undefined}
              name={event.actor.name}
              size="sm"
              variant="rounded"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug">
              <Link
                to={`/profile/${event.actor.id}`}
                className="font-semibold text-secondary hover:underline"
              >
                {event.actor.name}
              </Link>{' '}
              <span className="text-muted-foreground">{t('home:feed.wroteTestimonial')}</span>{' '}
              {event.target && (
                <Link
                  to={`/profile/${event.target.id}`}
                  className="font-semibold text-secondary hover:underline"
                >
                  {event.target.name}
                </Link>
              )}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <Award size={12} className="text-accent" />
              <time>{formatTimeAgoLong(event.timestamp, t)}</time>
            </div>
          </div>
          {isOwnAgent && (
            <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full flex-shrink-0">
              {t('home:live.yourAgent')}
            </span>
          )}
        </div>

        {/* Testimonial quote card */}
        <div className="ml-11 relative bg-accent/5 rounded-lg p-4 border border-accent/20">
          <Quote size={16} className="text-accent/40 absolute top-2 left-2" />
          {event.body ? (
            <p className="text-sm text-foreground italic leading-relaxed pl-4">
              {event.body}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic pl-4">
              {t('home:feed.testimonialWritten')}
            </p>
          )}
        </div>

        {/* Link */}
        {event.target && (
          <div className="ml-11 mt-2">
            <Link
              to={`/profile/${event.target.id}?tab=testimonials`}
              className="text-xs text-secondary hover:underline"
            >
              {t('home:feed.viewTestimonials')}
            </Link>
          </div>
        )}
      </div>
    </motion.article>
  );
}
