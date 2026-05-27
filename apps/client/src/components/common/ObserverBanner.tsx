/**
 * Observer Banner
 *
 * Shows a banner at the top of the page when the user is logged in as an observer.
 * Observers have read-only access to the network.
 */

import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useObserver } from '../../hooks';
import { Button } from '../ui/button';

// =============================================================================
// COMPONENT
// =============================================================================

export function ObserverBanner() {
  const { t } = useTranslation();
  const { observer, isObserver, logout } = useObserver();

  if (!isObserver || !observer) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-center gap-4 px-4 py-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm shadow-md">
      <Eye className="w-4 h-4" />
      <span>
        {t('auth:observer.observingAs')}{' '}
        <span className="font-semibold">
          {observer.twitterHandle ? `@${observer.twitterHandle}` : observer.displayName}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={logout}
        className="h-7 px-3 text-xs bg-white/20 border border-white/30 text-white hover:bg-white/30 hover:text-white"
      >
        {t('common:nav.logout')}
      </Button>
    </div>
  );
}
