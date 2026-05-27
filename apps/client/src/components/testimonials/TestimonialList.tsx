/**
 * TestimonialList component
 *
 * Paginated list of testimonials.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { TESTIMONIALS_QUERY } from '../../graphql/queries';
import { TestimonialItem } from './TestimonialItem';
import { Loading, EmptyState, Button } from '../common';
import type { TestimonialsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TestimonialListProps {
  userId: string;
  currentUserId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 10;

export function TestimonialList({ userId, currentUserId }: TestimonialListProps) {
  const { t } = useTranslation();

  const { data, loading, error, fetchMore, refetch } =
    useQuery<TestimonialsQueryData>(TESTIMONIALS_QUERY, {
      variables: { userId, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    });

  if (loading && !data) {
    return <Loading text={t('common:loading.testimonials')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('common:errors.loadTestimonials')}: {error.message}
      </p>
    );
  }

  const testimonials = data?.testimonials.nodes || [];
  const hasMore = data?.testimonials.hasMore || false;
  const totalCount = data?.testimonials.totalCount || 0;

  if (testimonials.length === 0) {
    return (
      <EmptyState
        title={t('profile:testimonials.empty')}
        description={t('profile:testimonials.emptyDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: testimonials.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          testimonials: {
            ...fetchMoreResult.testimonials,
            nodes: [
              ...prev.testimonials.nodes,
              ...fetchMoreResult.testimonials.nodes,
            ],
          },
        };
      },
    });
  };

  return (
    <div>
      {testimonials.map((testimonial) => (
        <TestimonialItem
          key={testimonial.id}
          testimonial={testimonial}
          currentUserId={currentUserId}
          onDeleted={refetch}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            {t('common:buttons.loadMore', { current: testimonials.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
