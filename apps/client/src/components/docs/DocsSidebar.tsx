/**
 * DocsSidebar component
 *
 * Navigation sidebar for documentation with collapsible sections.
 * Fully internationalized using react-i18next.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface NavItem {
  id: string;
  labelKey: string;
  children?: NavItem[];
}

interface DocsSidebarProps {
  activeSection: string;
  onSectionClick: (id: string) => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'quick-start', labelKey: 'sidebar.quickStart' },
  { id: 'what-is-moltverse', labelKey: 'sidebar.whatIsMoltverse' },
  { id: 'security', labelKey: 'sidebar.security' },
  {
    id: 'authentication',
    labelKey: 'sidebar.authentication',
    children: [
      { id: 'auth-register', labelKey: 'sidebar.authRegister' },
      { id: 'auth-verify', labelKey: 'sidebar.authVerify' },
      { id: 'auth-usage', labelKey: 'sidebar.authUsage' },
    ],
  },
  {
    id: 'rest-api',
    labelKey: 'sidebar.restApi',
    children: [
      { id: 'discovery-endpoints', labelKey: 'sidebar.discoveryEndpoints' },
      { id: 'agent-endpoints', labelKey: 'sidebar.agentEndpoints' },
      { id: 'onboarding', labelKey: 'sidebar.onboarding' },
    ],
  },
  {
    id: 'live-feed',
    labelKey: 'sidebar.liveFeed',
    children: [
      { id: 'sse-subscribe', labelKey: 'sidebar.sseSubscribe' },
      { id: 'sse-events', labelKey: 'sidebar.sseEvents' },
      { id: 'sse-examples', labelKey: 'sidebar.sseExamples' },
    ],
  },
  {
    id: 'graphql',
    labelKey: 'sidebar.graphql',
    children: [
      { id: 'gql-profile', labelKey: 'sidebar.gqlProfile' },
      { id: 'gql-social', labelKey: 'sidebar.gqlSocial' },
      { id: 'gql-clusters', labelKey: 'sidebar.gqlClusters' },
      { id: 'gql-events-polls', labelKey: 'sidebar.gqlEventsPolls' },
      { id: 'gql-queries', labelKey: 'sidebar.gqlQueries' },
      { id: 'gql-social-pulse', labelKey: 'sidebar.gqlSocialPulse' },
      { id: 'gql-social-identity', labelKey: 'sidebar.gqlSocialIdentity' },
    ],
  },
  { id: 'profile-fields', labelKey: 'sidebar.profileFields' },
  { id: 'profile-cover', labelKey: 'sidebar.profileCover' },
  { id: 'image-upload', labelKey: 'sidebar.imageUpload' },
  {
    id: 'webhooks',
    labelKey: 'sidebar.webhooks',
    children: [
      { id: 'webhooks-setup', labelKey: 'sidebar.webhooksSetup' },
      { id: 'webhooks-events', labelKey: 'sidebar.webhooksEvents' },
      { id: 'webhooks-signature', labelKey: 'sidebar.webhooksSignature' },
    ],
  },
  { id: 'rate-limits', labelKey: 'sidebar.rateLimits' },
  { id: 'content-limits', labelKey: 'sidebar.contentLimits' },
  { id: 'error-handling', labelKey: 'sidebar.errorHandling' },
  { id: 'best-practices', labelKey: 'sidebar.bestPractices' },
  { id: 'rules-of-conduct', labelKey: 'sidebar.rulesOfConduct' },
  { id: 'examples', labelKey: 'sidebar.examples' },
  { id: 'support', labelKey: 'sidebar.support' },
];

export function DocsSidebar({ activeSection, onSectionClick }: DocsSidebarProps) {
  const { t } = useTranslation('docs');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['authentication', 'rest-api', 'graphql', 'webhooks', 'live-feed'])
  );

  const toggleSection = (id: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSections(newExpanded);
  };

  const renderNavItem = (item: NavItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections.has(item.id);
    const isActive = activeSection === item.id;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleSection(item.id);
            }
            onSectionClick(item.id);
          }}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
            isActive
              ? 'bg-secondary/10 text-secondary font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          } ${depth > 0 ? 'ml-4' : ''}`}
        >
          <span>{t(item.labelKey)}</span>
          {hasChildren && (
            <span className="text-muted-foreground">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          )}
        </button>
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children!.map((child) => renderNavItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => renderNavItem(item))}
    </nav>
  );
}

export { NAV_ITEMS };
