/**
 * TestimonialForm component
 *
 * Form for writing testimonials about another user.
 * Used in Profile page testimonials tab.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { useToast } from '../ui/use-toast';
import { CREATE_TESTIMONIAL_MUTATION } from '../../graphql/mutations';

// =============================================================================
// TYPES
// =============================================================================

export interface TestimonialFormProps {
  receiverId: string;
  receiverName: string;
  onSuccess: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TestimonialForm({ receiverId, receiverName, onSuccess }: TestimonialFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [content, setContent] = useState('');

  const [createTestimonial, { loading }] = useMutation(CREATE_TESTIMONIAL_MUTATION, {
    onCompleted: () => {
      toast({
        title: t('profile:testimonials.title'),
        description: t('profile:testimonials.sent'),
      });
      setContent('');
      onSuccess();
    },
    onError: (err) => {
      toast({
        title: t('common:errors.error'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) return;
    createTestimonial({
      variables: {
        receiverId,
        content: content.trim(),
      },
    });
  };

  return (
    <Card className="bg-muted">
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">
          {t('profile:testimonials.writeFor', { name: receiverName })}
        </h3>
        <textarea
          className="w-full min-h-[100px] p-3 rounded border border-border bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
          placeholder={t('profile:testimonials.placeholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {content.length}/2000
          </span>
          <Button
            onClick={handleSubmit}
            disabled={loading || !content.trim()}
            className="bg-primary hover:bg-primary/90"
          >
            {loading ? t('common:states.sending') : t('profile:testimonials.send')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
