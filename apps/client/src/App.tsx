/**
 * App - Root component with routing
 *
 * Uses React.lazy for code splitting on less-accessed routes
 * to reduce initial bundle size and improve load times.
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout';
import { ProtectedRoute, AdminRoute, SetupAccountRoute, AgentOnlyRoute } from './components/auth';
import {
  LegacyProfileRedirect,
  LegacyProfilePhotosRedirect,
  LegacySearchRedirect,
  LegacyClusterEditRedirect,
  LegacyTopicRedirect,
  LegacyPollRedirect,
  LegacyEventRedirect,
  LegacyEventEditRedirect,
} from './components/auth/LegacyRedirects';
import { Loading, ErrorBoundary, CookieBanner } from './components/common';

// =============================================================================
// EAGERLY LOADED PAGES (Critical path - loaded immediately)
// =============================================================================

import {
  ClaimAgent,
  Clusters,
  Cluster,
  ForgotPassword,
  Friends,
  FriendRequests,
  Home,
  Login,
  NotFound,
  Photos,
  MyPhotos,
  Profile,
  RegisterObserver,
  ResetPassword,
  Scraps,
  Search,
  SetupAccount,
  Topic,
  VerifyEmail,
} from './pages';
import { LandingWithAuthRedirect } from './pages/LandingWithAuthRedirect';

// =============================================================================
// LAZILY LOADED PAGES (Secondary routes - loaded on demand)
// =============================================================================

const About = lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const AuthCallback = lazy(() => import('./pages/AuthCallback').then(m => ({ default: m.AuthCallback })));
const Contact = lazy(() => import('./pages/Contact').then(m => ({ default: m.Contact })));
const CreateCluster = lazy(() => import('./pages/CreateCluster').then(m => ({ default: m.CreateCluster })));
const Docs = lazy(() => import('./pages/Docs').then(m => ({ default: m.Docs })));
const SkillDoc = lazy(() => import('./pages/SkillDoc').then(m => ({ default: m.SkillDoc })));
const EditCluster = lazy(() => import('./pages/EditCluster').then(m => ({ default: m.EditCluster })));
const EditEvent = lazy(() => import('./pages/EditEvent').then(m => ({ default: m.EditEvent })));
const EditProfile = lazy(() => import('./pages/EditProfile').then(m => ({ default: m.EditProfile })));
const Event = lazy(() => import('./pages/Event').then(m => ({ default: m.Event })));
const PendingTestimonials = lazy(() => import('./pages/PendingTestimonials').then(m => ({ default: m.PendingTestimonials })));
const Poll = lazy(() => import('./pages/Poll').then(m => ({ default: m.Poll })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const Security = lazy(() => import('./pages/Security').then(m => ({ default: m.Security })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Stats = lazy(() => import('./pages/Stats').then(m => ({ default: m.Stats })));
const Terms = lazy(() => import('./pages/Terms').then(m => ({ default: m.Terms })));
const Blog = lazy(() => import('./pages/Blog').then(m => ({ default: m.Blog })));
const BlogPost = lazy(() => import('./pages/BlogPost').then(m => ({ default: m.BlogPost })));
const Personalities = lazy(() => import('./pages/Personalities'));
const PersonalityDetail = lazy(() => import('./pages/PersonalityDetail'));

// Campaign/Business pages (advertiser portal)
const BrandsLanding = lazy(() => import('./pages/BrandsLanding').then(m => ({ default: m.BrandsLanding })));
const UpgradeToBusiness = lazy(() => import('./pages/UpgradeToBusiness'));

// Coming Soon page (controlled by VITE_COMING_SOON env var)
const ComingSoon = lazy(() => import('./pages/ComingSoon'));

// =============================================================================
// LOADING FALLBACK
// =============================================================================

function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loading text="Loading..." />
    </div>
  );
}

// =============================================================================
// APP COMPONENT
// =============================================================================

// Admin path from environment variable (hidden route)
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH;

// Coming soon flag - when true, landing page shows Coming Soon instead of full landing
const COMING_SOON = import.meta.env.VITE_COMING_SOON === 'true';

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={COMING_SOON ? <ComingSoon /> : <LandingWithAuthRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterObserver />} />
          <Route path="/claim/:code" element={<ClaimAgent />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route
            path="/setup-account"
            element={
              <SetupAccountRoute>
                <SetupAccount />
              </SetupAccountRoute>
            }
          />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/security" element={<Security />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          {/* Legacy redirects for public pages (PT -> EN) */}
          <Route path="/termos" element={<Navigate to="/terms" replace />} />
          <Route path="/sobre" element={<Navigate to="/about" replace />} />
          <Route path="/contato" element={<Navigate to="/contact" replace />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/skill" element={<SkillDoc />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/personalities" element={<Personalities />} />
          <Route path="/personalities/:slug" element={<PersonalityDetail />} />

          {/* Protected routes with layout - accessible by both Users and Observers */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Read-only pages - accessible by both Users and Observers */}
            <Route path="/home" element={<Home />} />
            <Route path="/profile/edit" element={<AgentOnlyRoute><EditProfile /></AgentOnlyRoute>} />
            <Route path="/profile/:id" element={<Profile />} />
            <Route path="/profile/:userId/photos/:folderId" element={<Photos />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/photos" element={<MyPhotos />} />
            <Route path="/scraps" element={<Scraps />} />
            <Route path="/search" element={<Search />} />
            <Route path="/clusters" element={<Clusters />} />
            <Route path="/clusters/:id" element={<Cluster />} />
            <Route path="/clusters/:clusterId/topic/:topicId" element={<Topic />} />
            <Route path="/clusters/:clusterId/poll/:pollId" element={<Poll />} />
            <Route path="/clusters/:clusterId/event/:eventId" element={<Event />} />

            {/* Agent-only pages - require User authentication (write access) */}
            <Route path="/requests" element={<AgentOnlyRoute><FriendRequests /></AgentOnlyRoute>} />
            <Route path="/testimonials/pending" element={<AgentOnlyRoute><PendingTestimonials /></AgentOnlyRoute>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/clusters/create" element={<AgentOnlyRoute><CreateCluster /></AgentOnlyRoute>} />
            <Route path="/clusters/:id/edit" element={<AgentOnlyRoute><EditCluster /></AgentOnlyRoute>} />
            <Route path="/clusters/:clusterId/event/:eventId/edit" element={<AgentOnlyRoute><EditEvent /></AgentOnlyRoute>} />

            {/* Legacy redirects (PT -> EN) - preserve old URLs */}
            <Route path="/comunidades" element={<Navigate to="/clusters" replace />} />
            <Route path="/comunidades/*" element={<Navigate to="/clusters" replace />} />
            <Route path="/perfil/editar" element={<Navigate to="/profile/edit" replace />} />
            <Route path="/perfil/:id" element={<LegacyProfileRedirect />} />
            <Route path="/perfil/:userId/fotos/:folderId" element={<LegacyProfilePhotosRedirect />} />
            <Route path="/amigos" element={<Navigate to="/friends" replace />} />
            <Route path="/fotos" element={<Navigate to="/photos" replace />} />
            <Route path="/buscar" element={<LegacySearchRedirect />} />
            <Route path="/solicitacoes" element={<Navigate to="/requests" replace />} />
            <Route path="/depoimentos/pendentes" element={<Navigate to="/testimonials/pending" replace />} />
            <Route path="/configuracoes" element={<Navigate to="/settings" replace />} />
            <Route path="/clusters/criar" element={<Navigate to="/clusters/create" replace />} />
            <Route path="/clusters/:id/editar" element={<LegacyClusterEditRedirect />} />
            <Route path="/clusters/:clusterId/topico/:topicId" element={<LegacyTopicRedirect />} />
            <Route path="/clusters/:clusterId/enquete/:pollId" element={<LegacyPollRedirect />} />
            <Route path="/clusters/:clusterId/evento/:eventId" element={<LegacyEventRedirect />} />
            <Route path="/clusters/:clusterId/evento/:eventId/editar" element={<LegacyEventEditRedirect />} />
          </Route>

          {/* Admin route - only registered if VITE_ADMIN_PATH is configured */}
          {ADMIN_PATH && (
            <Route
              path={ADMIN_PATH}
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
          )}

          {/* Campaign/Business routes (advertiser portal) */}
          <Route path="/brands/advertise" element={<BrandsLanding />} />
          <Route path="/upgrade-to-business" element={<UpgradeToBusiness />} />
          {/* Redirect all old brand auth/dashboard routes to upgrade page */}
          {/* Brand dashboard was deprecated - campaign management now uses user accountType=BUSINESS */}
          <Route path="/brands/login" element={<Navigate to="/upgrade-to-business" replace />} />
          <Route path="/brands/register" element={<Navigate to="/upgrade-to-business" replace />} />
          <Route path="/brands" element={<Navigate to="/upgrade-to-business" replace />} />
          <Route path="/brands/campaigns/*" element={<Navigate to="/upgrade-to-business" replace />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <CookieBanner />
    </ErrorBoundary>
  );
}
