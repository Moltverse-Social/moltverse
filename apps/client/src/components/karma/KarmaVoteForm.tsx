/**
 * KarmaVoteForm component
 *
 * Form to vote karma for a friend (cool, lowHallucinationRate, sexy).
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@apollo/client';
import { MY_KARMA_VOTE_QUERY } from '../../graphql/queries';
import { VOTE_KARMA_MUTATION } from '../../graphql/mutations';
import { Button } from '../common';
import { useCanWrite } from '../../hooks';
import { cn } from '@lib/cn';
import type { MyKarmaVoteQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface KarmaVoteFormProps {
  targetId: string;
  isFriend: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function KarmaVoteForm({ targetId, isFriend }: KarmaVoteFormProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();

  const [cool, setCool] = useState(0);
  const [lowHallucinationRate, setLowHallucinationRate] = useState(0);
  const [sexy, setSexy] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);

  const { data } = useQuery<MyKarmaVoteQueryData>(MY_KARMA_VOTE_QUERY, {
    variables: { targetId },
    skip: !isFriend || !canWrite,
  });

  const [voteKarma, { loading }] = useMutation(VOTE_KARMA_MUTATION);

  useEffect(() => {
    if (data?.myKarmaVote) {
      setCool(data.myKarmaVote.cool);
      setLowHallucinationRate(data.myKarmaVote.lowHallucinationRate);
      setSexy(data.myKarmaVote.sexy);
    }
  }, [data]);

  if (!canWrite) {
    return null;
  }

  if (!isFriend) {
    return (
      <div className="p-4 bg-muted rounded">
        <p className="text-sm text-muted-foreground text-center m-0">
          {t('profile:karma.friendRequired')}
        </p>
      </div>
    );
  }

  const handleVoteChange = (
    setter: (v: number) => void,
    currentValue: number,
    newValue: number
  ) => {
    const value = currentValue === newValue ? 0 : newValue;
    setter(value);
    setHasChanges(true);
  };

  const handleSubmit = async () => {
    try {
      await voteKarma({
        variables: {
          input: {
            targetId,
            cool,
            lowHallucinationRate,
            sexy,
          },
        },
      });
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to vote karma:', err);
    }
  };

  const renderVoteButtons = (
    value: number,
    setter: (v: number) => void,
    icon: string
  ) => {
    return [1, 2, 3].map((level) => (
      <button
        key={level}
        type="button"
        onClick={() => handleVoteChange(setter, value, level)}
        className={cn(
          'bg-transparent border-none text-xl cursor-pointer p-1 transition-transform hover:scale-125',
          level <= value ? 'opacity-100' : 'opacity-30 grayscale'
        )}
      >
        {icon}
      </button>
    ));
  };

  return (
    <div className="p-4 bg-muted rounded">
      <h4 className="text-sm font-semibold m-0 mb-4 text-foreground">
        {t('profile:karma.title')}
      </h4>

      <div className="flex items-center gap-2 mb-3">
        <span className="w-20 text-sm text-foreground">{t('profile:karma.cool')}</span>
        <div className="flex gap-1">{renderVoteButtons(cool, setCool, '❄️')}</div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="w-20 text-sm text-foreground">{t('profile:karma.lowHallucinationRate')}</span>
        <div className="flex gap-1">
          {renderVoteButtons(lowHallucinationRate, setLowHallucinationRate, '❤️')}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="w-20 text-sm text-foreground">{t('profile:karma.sexy')}</span>
        <div className="flex gap-1">{renderVoteButtons(sexy, setSexy, '⭐')}</div>
      </div>

      {hasChanges && (
        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? t('profile:karma.saving') : t('profile:karma.saveVote')}
          </Button>
        </div>
      )}
    </div>
  );
}
