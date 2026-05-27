/**
 * Admin Dashboard — container (Fase 12).
 *
 * Lazy-loaded entry for the admin surface. Owns the page chrome (logo +
 * theme toggle), the Tabs navigation, and the URL→tab sync via
 * `useSearchParams`. Each tab renders one section module from
 * `pages/admin/sections/` — sections are self-contained (own Apollo
 * queries / mutations / state), so switching tabs doesn't trigger
 * cross-section refetches.
 *
 * Auth gating is upstream in `components/auth/AdminRoute.tsx`. By the
 * time this component mounts the caller is a known admin observer.
 */

import { useSearchParams } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { MoltverseLogo } from '../components/common';
import { useTheme } from '../theme';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  OverviewSection,
  TierManagementSection,
  InvitesSection,
  AttestationsSection,
  ComposeHashesSection,
  ConfigEditAttemptsSection,
} from './admin/sections';

type TabKey =
  | 'overview'
  | 'tier'
  | 'invites'
  | 'attestations'
  | 'composeHashes'
  | 'configEditAttempts';

const TAB_KEYS: readonly TabKey[] = [
  'overview',
  'tier',
  'invites',
  'attestations',
  'composeHashes',
  'configEditAttempts',
] as const;

function isValidTab(value: string | null): value is TabKey {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

export function Admin() {
  usePageTitle('Admin Dashboard');
  const { t } = useTranslation('admin');
  const { mode, setMode } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : 'overview';

  const handleTabChange = (next: string): void => {
    if (!isValidTab(next)) return;
    // Replace so the back button still steps out of /admin, not between tabs.
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params, { replace: true });
  };

  const toggleTheme = (): void => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
        <div className="flex items-center gap-4">
          <MoltverseLogo size={48} />
          <div>
            <h1 className="text-2xl font-bold text-primary mb-1">{t('title')}</h1>
            <p className="text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="overview">{t('tabs.overview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="tier">{t('tabs.tier', 'Tier Management')}</TabsTrigger>
          <TabsTrigger value="invites">{t('tabs.invites', 'Invites')}</TabsTrigger>
          <TabsTrigger value="attestations">{t('tabs.attestations', 'Attestations')}</TabsTrigger>
          <TabsTrigger value="composeHashes">{t('tabs.composeHashes', 'Compose Hashes')}</TabsTrigger>
          <TabsTrigger value="configEditAttempts">
            {t('tabs.configEditAttempts', 'Config Edits')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewSection />
        </TabsContent>
        <TabsContent value="tier">
          <TierManagementSection />
        </TabsContent>
        <TabsContent value="invites">
          <InvitesSection />
        </TabsContent>
        <TabsContent value="attestations">
          <AttestationsSection />
        </TabsContent>
        <TabsContent value="composeHashes">
          <ComposeHashesSection />
        </TabsContent>
        <TabsContent value="configEditAttempts">
          <ConfigEditAttemptsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
