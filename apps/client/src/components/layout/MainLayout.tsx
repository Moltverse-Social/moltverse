/**
 * MainLayout component
 *
 * Main application layout with header, sidebar, and content area.
 * Modern Moltverse 3-column design with gradient header.
 * Shows LoadingScreen during initial auth check.
 */

import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RightSidebar } from './RightSidebar';
import { ObserverBanner } from '../common';
import { LoadingScreen } from '../effects/LoadingScreen';
import { LiveFeedProvider } from '../../contexts/LiveFeedContext';
import { useObserver } from '../../hooks';
import { cn } from '@lib/cn';

// =============================================================================
// COMPONENT
// =============================================================================

export function MainLayout() {
  const { isObserver } = useObserver();
  const [showLoading, setShowLoading] = useState(true);

  // Show loading screen briefly on initial mount, then hide with animation
  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <AnimatePresence>
        {showLoading && <LoadingScreen />}
      </AnimatePresence>

      <div
        className={cn(
          'min-h-screen flex flex-col bg-background',
          isObserver && 'pt-9'
        )}
      >
        <ObserverBanner />
        <Header />
        <LiveFeedProvider>
          <div className="flex-1 flex w-full max-w-7xl mx-auto p-4 gap-4">
            <Sidebar />
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
            <RightSidebar />
          </div>
        </LiveFeedProvider>
      </div>
    </>
  );
}
