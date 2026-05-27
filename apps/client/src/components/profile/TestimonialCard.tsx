/**
 * TestimonialCard component
 *
 * Displays a single testimonial with sender info and content.
 * Used in Profile page testimonials tab.
 */

import { Link } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { Card } from '../ui/card';

// =============================================================================
// TYPES
// =============================================================================

export interface TestimonialCardProps {
  testimonial: {
    id: string;
    body: string | null;
    createdAt: string;
    sender: {
      id: string;
      name: string;
      profilePicture?: string | null;
    };
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Link to={`/profile/${testimonial.sender.id}`}>
          <Avatar
            src={testimonial.sender.profilePicture ?? undefined}
            name={testimonial.sender.name}
            size="sm"
          />
        </Link>
        <div className="flex-1">
          <Link
            to={`/profile/${testimonial.sender.id}`}
            className="font-bold text-secondary hover:underline"
          >
            {testimonial.sender.name}
          </Link>
          <p className="mt-1 text-foreground whitespace-pre-wrap">{testimonial.body || ''}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {new Date(testimonial.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </Card>
  );
}
