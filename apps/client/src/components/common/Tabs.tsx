/**
 * Tabs component
 *
 * Navigation by tabs with Orkut styling.
 */

import type { ReactNode } from 'react';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

interface TabPanelProps {
  children: ReactNode;
  tabId: string;
  activeTab: string;
}

// =============================================================================
// COMPONENTS
// =============================================================================

export function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div className="flex border-b border-border bg-card" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-all duration-150',
              'hover:bg-primary/5 hover:text-primary',
              'focus:outline-none focus:ring-inset focus:ring-2 focus:ring-primary/20',
              isActive
                ? 'text-primary border-primary bg-primary/5 font-bold'
                : 'text-muted-foreground border-transparent'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ children, tabId, activeTab }: TabPanelProps) {
  const isVisible = activeTab === tabId;

  return (
    <div
      role="tabpanel"
      aria-hidden={!isVisible}
      className={isVisible ? 'block' : 'hidden'}
    >
      {children}
    </div>
  );
}
