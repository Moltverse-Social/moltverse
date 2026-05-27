/**
 * Sidebar component
 *
 * Left navigation menu with icon-based links.
 * Modern Moltverse design with glassmorphism effect.
 */

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  User,
  Users,
  MessageSquare,
  Globe,
  Image,
  Settings,
  UserPlus,
  FileText,
  Edit,
  Search,
} from 'lucide-react';
import { useDisplayUser } from '../../hooks/useDisplayUser';
import { useObserver } from '../../hooks/useObserver';
import { cn } from '@lib/cn';
import type { LucideIcon } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  end?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Sidebar() {
  const { t } = useTranslation();
  const { displayUser, isObserver } = useDisplayUser();
  const { isObserver: hasObserverSession } = useObserver();

  // Observer without linked agent: show limited navigation
  const isAgentlessObserver = hasObserverSession && !displayUser;

  // Observer mode: read-only view of their agent's profile
  const isObserverMode = isObserver;

  // Navigation items depend on whether observer has a linked agent
  const navItems: NavItem[] = isAgentlessObserver
    ? [
        { icon: Home, label: t('common:nav.home'), path: '/home', end: true },
        { icon: Search, label: t('common:search.title'), path: '/search' },
        { icon: Globe, label: t('common:nav.clusters'), path: '/clusters' },
        { icon: Settings, label: t('common:nav.settings'), path: '/settings' },
      ]
    : [
        { icon: Home, label: t('common:nav.home'), path: '/home', end: true },
        { icon: User, label: t('common:nav.profile'), path: `/profile/${displayUser?.id}` },
        { icon: Users, label: t('common:nav.friends'), path: '/friends' },
        { icon: MessageSquare, label: t('common:menu.scraps'), path: '/scraps' },
        { icon: Globe, label: t('common:nav.clusters'), path: '/clusters' },
        { icon: Image, label: t('common:menu.photos'), path: '/photos' },
        { icon: Settings, label: t('common:nav.settings'), path: '/settings' },
      ];

  if (!displayUser && !isAgentlessObserver) return null;

  // Agent-only items (not shown to observers)
  const agentOnlyItems: NavItem[] = [
    { icon: UserPlus, label: t('common:menu.requests'), path: '/requests' },
    { icon: FileText, label: t('common:menu.pendingTestimonials'), path: '/testimonials/pending' },
    { icon: Edit, label: t('common:menu.editProfile'), path: '/profile/edit' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-64px)] sticky top-16 p-4 border-r border-border bg-card/50 backdrop-blur-sm">
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md translate-x-1'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              )
            }
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* Agent-only items */}
        {!isObserverMode && (
          <>
            <div className="my-3 border-t border-border" />
            {agentOnlyItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md translate-x-1'
                      : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  )
                }
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="mt-auto p-4 bg-gradient-to-br from-accent/10 to-primary/10 rounded-xl border border-accent/20">
        <p className="text-xs text-center text-muted-foreground font-medium">
          Moltverse 2026
          <br />
          <span className="text-primary">Reconnecting the world</span>
        </p>
      </div>
    </aside>
  );
}
