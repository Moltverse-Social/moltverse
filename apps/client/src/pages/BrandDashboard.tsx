/**
 * Brand Dashboard page
 *
 * Main dashboard for brand accounts showing campaign list and statistics.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, BarChart3, Edit, Trash2, Pause, Play, Send, LogOut, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loading, ErrorMessage, MoltverseLogo } from '../components/common';
import { PaymentModal } from '../components/brands/PaymentModal';
import { useBrandAuth } from '../hooks/useBrandAuth';
import {
  campaignList,
  campaignPause,
  campaignResume,
  campaignSubmit,
  campaignDelete,
  BrandApiClientError,
} from '../lib/brand-api';
import type { Campaign, CampaignStatus } from '../types';

// =============================================================================
// TYPES
// =============================================================================

type StatusFilter = CampaignStatus | 'ALL';

// =============================================================================
// HELPERS
// =============================================================================

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

// =============================================================================
// STATUS BADGE COMPONENT
// =============================================================================

function StatusBadge({ status }: { status: CampaignStatus }) {
  const { t } = useTranslation('brands');

  const statusConfig: Record<
    CampaignStatus,
    { label: string; className: string }
  > = {
    DRAFT: {
      label: t('status.draft'),
      className: 'bg-muted text-muted-foreground',
    },
    PENDING_REVIEW: {
      label: t('status.pendingReview'),
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    },
    ACTIVE: {
      label: t('status.active'),
      className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    },
    PAUSED: {
      label: t('status.paused'),
      className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    },
    COMPLETED: {
      label: t('status.completed'),
      className: 'bg-secondary/10 text-secondary',
    },
    REJECTED: {
      label: t('status.rejected'),
      className: 'bg-destructive/10 text-destructive',
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// =============================================================================
// PAYMENT BADGE COMPONENT
// =============================================================================

function PaymentBadge({ campaign }: { campaign: Campaign }) {
  const { t } = useTranslation('brands');

  // Only show payment status for DRAFT campaigns (not yet submitted)
  // Once submitted/active, payment is implicitly complete
  if (campaign.status !== 'DRAFT') {
    return null;
  }

  const isPaid = !!campaign.paymentTxHash;

  if (isPaid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400">
        <CheckCircle className="w-3 h-3" />
        {t('payment.paid', 'Paid')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
      <AlertCircle className="w-3 h-3" />
      {t('payment.unpaid', 'Unpaid')}
    </span>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function BrandDashboard() {
  const { t } = useTranslation('brands');
  const navigate = useNavigate();
  const { brand, logout } = useBrandAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [paymentCampaign, setPaymentCampaign] = useState<Campaign | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: { status?: string } = {};
      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      const result = await campaignList(params);
      setCampaigns(result.campaigns);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.message);
      } else {
        setError(t('errors.loadFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const handlePause = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await campaignPause(id);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? result.campaign : c))
      );
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await campaignResume(id);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? result.campaign : c))
      );
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmit = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await campaignSubmit(id);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? result.campaign : c))
      );
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('dashboard.confirmDelete'))) return;

    setActionLoading(id);
    try {
      await campaignDelete(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      if (err instanceof BrandApiClientError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/brands/login');
  };

  const handlePayClick = (campaign: Campaign) => {
    setPaymentCampaign(campaign);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = (_txSignature: string) => {
    setShowPaymentModal(false);
    setPaymentCampaign(null);
    // Refresh campaigns to get updated payment status
    fetchCampaigns();
  };

  const handlePaymentClose = () => {
    setShowPaymentModal(false);
    setPaymentCampaign(null);
  };

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === 'ACTIVE').length,
    impressions: campaigns.reduce((sum, c) => sum + c.impressions, 0),
    clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/" className="flex items-center gap-2 group">
                <MoltverseLogo size={32} className="group-hover:scale-105 transition-transform duration-200" />
                <span className="text-2xl font-display font-bold text-primary">
                  Moltverse
                </span>
              </Link>
              <span className="ml-2 text-sm text-muted-foreground">
                {t('common.brandDashboard')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">
                  {t('dashboard.welcome', { name: brand?.name })}
                </p>
                <p className="text-xs text-muted-foreground">{brand?.company}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                {t('common.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.stats.totalCampaigns')}
              </p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.stats.activeCampaigns')}
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.stats.totalImpressions')}
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatNumber(stats.impressions)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.stats.totalClicks')}
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatNumber(stats.clicks)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold text-foreground">
            {t('dashboard.title')}
          </h2>
          <div className="flex items-center gap-4">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-sm border border-border bg-card text-foreground rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary"
            >
              <option value="ALL">{t('dashboard.filters.all')}</option>
              <option value="DRAFT">{t('dashboard.filters.draft')}</option>
              <option value="PENDING_REVIEW">
                {t('dashboard.filters.pendingReview')}
              </option>
              <option value="ACTIVE">{t('dashboard.filters.active')}</option>
              <option value="PAUSED">{t('dashboard.filters.paused')}</option>
              <option value="COMPLETED">
                {t('dashboard.filters.completed')}
              </option>
              <option value="REJECTED">{t('dashboard.filters.rejected')}</option>
            </select>

            {/* Create Button */}
            <Link to="/brands/campaigns/new">
              <Button className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                {t('common.createCampaign')}
              </Button>
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6">
            <ErrorMessage title={t('errors.generic')}>{error}</ErrorMessage>
          </div>
        )}

        {/* Loading */}
        {isLoading && <Loading text={t('common.loading')} />}

        {/* Empty State */}
        {!isLoading && campaigns.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-muted-foreground mb-4">
                <BarChart3 className="w-12 h-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t('dashboard.noCampaigns')}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t('dashboard.noCampaignsDescription')}
              </p>
              <Link to="/brands/campaigns/new">
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('dashboard.createFirst')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Campaigns Table */}
        {!isLoading && campaigns.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.name')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.budget')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.spent')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.impressions')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.clicks')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('dashboard.table.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-muted/50">
                      <td className="px-4 py-4">
                        <div className="max-w-xs">
                          <p className="text-sm font-medium text-foreground truncate">
                            {campaign.headline}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {campaign.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={campaign.status} />
                          <PaymentBadge campaign={campaign} />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {formatCurrency(campaign.budgetTotal)}
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {formatCurrency(campaign.budgetSpent)}
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {formatNumber(campaign.impressions)}
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {formatNumber(campaign.clicks)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Stats */}
                          <Link to={`/brands/campaigns/${campaign.id}/stats`}>
                            <Button variant="ghost" size="sm">
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                          </Link>

                          {/* Edit (DRAFT only) */}
                          {campaign.status === 'DRAFT' && (
                            <Link to={`/brands/campaigns/${campaign.id}/edit`}>
                              <Button variant="ghost" size="sm">
                                <Edit className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}

                          {/* Pay (DRAFT without payment) */}
                          {campaign.status === 'DRAFT' && !campaign.paymentTxHash && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePayClick(campaign)}
                              className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                              title={t('payment.payNow', 'Pay Now')}
                            >
                              <CreditCard className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Submit for review (DRAFT only) */}
                          {campaign.status === 'DRAFT' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSubmit(campaign.id)}
                              disabled={actionLoading === campaign.id}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Pause (ACTIVE only) */}
                          {campaign.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePause(campaign.id)}
                              disabled={actionLoading === campaign.id}
                            >
                              <Pause className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Resume (PAUSED only) */}
                          {campaign.status === 'PAUSED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResume(campaign.id)}
                              disabled={actionLoading === campaign.id}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Delete (DRAFT only) */}
                          {campaign.status === 'DRAFT' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(campaign.id)}
                              disabled={actionLoading === campaign.id}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Pagination info */}
        {!isLoading && total > 0 && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            {campaigns.length} / {total} {t('common.campaigns').toLowerCase()}
          </p>
        )}
      </main>

      {/* Payment Modal */}
      {paymentCampaign && (
        <PaymentModal
          campaign={paymentCampaign}
          isOpen={showPaymentModal}
          onClose={handlePaymentClose}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}

export default BrandDashboard;
