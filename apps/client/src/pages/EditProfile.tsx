/**
 * EditProfile page
 *
 * Page for editing the current user's profile.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, UserPen } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { EditProfileForm } from '../components/forms';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loading } from '../components/common';

// =============================================================================
// COMPONENT
// =============================================================================

export function EditProfile() {
  usePageTitle('Edit Profile');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading text={t('common.loading')} />;
  }

  if (!user) {
    return null;
  }

  const handleSuccess = () => {
    navigate(`/profile/${user.id}`);
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <UserPen size={24} className="text-primary" />
            {t('editProfile.title')}
          </h1>
          <Link to={`/profile/${user.id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft size={16} className="mr-2" />
              {t('editProfile.backToProfile')}
            </Button>
          </Link>
        </div>

        {/* Form */}
        <CardContent className="p-6">
          <EditProfileForm user={user} onSuccess={handleSuccess} />
        </CardContent>
      </Card>
    </div>
  );
}
