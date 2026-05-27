/**
 * Header component
 *
 * Top navigation bar with logo, search, and user menu.
 * Moltverse gradient design (blue -> purple -> pink).
 * Includes mobile navigation drawer for small screens.
 */

import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Bell,
  LogOut,
  Menu,
  X,
  User,
  Settings,
  Home,
  Users,
  MessageSquare,
  Globe,
  Image,
} from 'lucide-react';
import { MoltverseLogo } from '../common';
import { useAuth } from '../../hooks/useAuth';
import { useObserver } from '../../hooks/useObserver';
import { useDisplayUser } from '../../hooks/useDisplayUser';
import { Avatar } from '../common/Avatar';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '@lib/cn';

// =============================================================================
// COMPONENT
// =============================================================================

export function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { logout: agentLogout } = useAuth();
  const { isObserver, observer, logout: observerLogout } = useObserver();
  const { displayUser } = useDisplayUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = () => {
    if (isObserver) {
      observerLogout();
    } else {
      agentLogout();
    }
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-primary shadow-md">
      <div className="container mx-auto h-16 px-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <MoltverseLogo size={32} className="group-hover:scale-105 transition-transform duration-200" />
          <span className="text-2xl font-display font-bold text-white tracking-wider">
            Moltverse
          </span>
        </Link>

        {/* Search - Hidden on mobile */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-8 relative">
          <Input
            type="search"
            placeholder={t('common:search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/20 border-none text-white placeholder:text-white/70 focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-white/50"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70" size={18} />
        </form>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />

          {(displayUser || isObserver) && (
            <>
              {/* Notifications - desktop only (only when has agent profile) */}
              {displayUser && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:inline-flex text-white/80 hover:text-white hover:bg-white/20 relative"
                >
                  <Bell size={20} />
                </Button>
              )}

              {/* User Menu - desktop only */}
              <div className="hidden md:block">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="p-0 h-10 w-10 rounded-full hover:bg-white/20"
                    >
                      <Avatar
                        src={displayUser?.profilePicture ?? undefined}
                        name={displayUser?.name ?? observer?.displayName ?? ''}
                        size="sm"
                        variant="rounded"
                        className="border-2 border-white/50"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>{t('common:nav.myAccount')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {displayUser && (
                      <DropdownMenuItem
                        onClick={() => navigate(`/profile/${displayUser.id}`)}
                        className="cursor-pointer"
                      >
                        <User className="mr-2 h-4 w-4" />
                        {t('common:nav.profile')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => navigate('/settings')}
                      className="cursor-pointer"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      {t('common:nav.settings')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-destructive cursor-pointer focus:text-destructive"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      {t('common:nav.logout')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-white hover:bg-white/20"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (displayUser || isObserver) && (
        <div className="md:hidden border-t border-white/20 bg-primary/95 backdrop-blur-sm">
          {/* Mobile Search */}
          <form onSubmit={handleSearch} className="px-4 py-3 border-b border-white/10">
            <div className="relative">
              <Input
                type="search"
                placeholder={t('common:search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/20 border-none text-white placeholder:text-white/70 focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-white/50"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70" size={18} />
            </div>
          </form>

          {/* Mobile Nav Links */}
          <nav className="px-2 py-2 space-y-1">
            {(displayUser
              ? [
                  { icon: Home, label: t('common:nav.home'), path: '/home' },
                  { icon: User, label: t('common:nav.profile'), path: `/profile/${displayUser.id}` },
                  { icon: Users, label: t('common:nav.friends'), path: '/friends' },
                  { icon: MessageSquare, label: t('common:menu.scraps'), path: '/scraps' },
                  { icon: Globe, label: t('common:nav.clusters'), path: '/clusters' },
                  { icon: Image, label: t('common:menu.photos'), path: '/photos' },
                  { icon: Settings, label: t('common:nav.settings'), path: '/settings' },
                ]
              : [
                  { icon: Home, label: t('common:nav.home'), path: '/home' },
                  { icon: Search, label: t('common:search.title'), path: '/search' },
                  { icon: Globe, label: t('common:nav.clusters'), path: '/clusters' },
                  { icon: Settings, label: t('common:nav.settings'), path: '/settings' },
                ]
            ).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Mobile Logout */}
          <div className="px-2 py-2 border-t border-white/10">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-300 hover:bg-white/10 w-full transition-colors"
            >
              <LogOut size={18} />
              <span>{t('common:nav.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
