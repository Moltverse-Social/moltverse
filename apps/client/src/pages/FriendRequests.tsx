/**
 * FriendRequests page
 *
 * Pending friend requests for the current user.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { FriendRequestList } from '../components/friends';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { usePageTitle } from '../hooks/usePageTitle';

// =============================================================================
// COMPONENT
// =============================================================================

export function FriendRequests() {
  usePageTitle('Friend Requests');
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-primary">
            {t('friendRequests.title')}
          </h1>
          <Link to="/friends">
            <Button variant="outline" size="sm">
              <ArrowLeft size={16} className="mr-2" />
              {t('friendRequests.backToFriends')}
            </Button>
          </Link>
        </div>

        {/* Request List */}
        <FriendRequestList />
      </Card>
    </div>
  );
}
