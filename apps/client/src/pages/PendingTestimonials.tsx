/**
 * PendingTestimonials page
 *
 * List of testimonials waiting for approval.
 */

import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquareHeart } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { PENDING_TESTIMONIALS_QUERY } from '../graphql/queries';
import { PendingTestimonialItem } from '../components/testimonials';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loading, EmptyState } from '../components/common';
import type { PendingTestimonialsQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function PendingTestimonials() {
  usePageTitle('Pending Testimonials');
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data, loading, error, refetch } =
    useQuery<PendingTestimonialsQueryData>(PENDING_TESTIMONIALS_QUERY, {
      fetchPolicy: 'cache-and-network',
    });

  if (loading && !data) {
    return <Loading text={t('pendingTestimonials.loading')} />;
  }

  if (error) {
    return (
      <div className="p-4 text-center text-destructive text-sm">
        {t('pendingTestimonials.error', { message: error.message })}
      </div>
    );
  }

  const testimonials = data?.pendingTestimonials.nodes || [];
  const totalCount = data?.pendingTestimonials.totalCount || 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <MessageSquareHeart size={24} className="text-primary" />
            {t('pendingTestimonials.title')}
          </h1>
          {user && (
            <Link to={`/profile/${user.id}`}>
              <Button variant="outline" size="sm">
                {t('pendingTestimonials.viewProfile')}
              </Button>
            </Link>
          )}
        </div>

        {testimonials.length === 0 ? (
          <EmptyState
            title={t('pendingTestimonials.empty.title')}
            description={t('pendingTestimonials.empty.description')}
          />
        ) : (
          <>
            <div className="py-2 px-4 text-sm text-muted-foreground bg-primary/5 border-b">
              {t('pendingTestimonials.count', { count: totalCount })}
            </div>
            {testimonials.map((testimonial) => (
              <PendingTestimonialItem
                key={testimonial.id}
                testimonial={testimonial}
                onHandled={refetch}
              />
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
