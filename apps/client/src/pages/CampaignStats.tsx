/**
 * Campaign Stats page
 *
 * Displays performance metrics and budget utilization for a campaign.
 * Accessible to campaign owner at any status (except DRAFT with no data).
 */

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, MousePointer, TrendingUp, DollarSign, Wallet, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loading, ErrorMessage } from '../components/common';
import {
  campaignGet,
  campaignGetStats,
  BrandApiClientError,
} from '../lib/brand-api';
import type { Campaign, CampaignStats as CampaignStatsType } from '../types';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format number with thousands separator
 */
function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Format currency in cents to dollars
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Format percentage with 2 decimal places
 */
function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Get status badge color
 */
function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-muted text-muted-foreground',
    PENDING_REVIEW: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400',
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
    PAUSED: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400',
    COMPLETED: 'bg-secondary/10 text-secondary',
    REJECTED: 'bg-destructive/10 text-destructive',
  };
  return colors[status] || colors.DRAFT;
}

/**
 * Convert status enum to translation key
 * DRAFT -> draft, PENDING_REVIEW -> pendingReview, ACTIVE -> active, etc.
 */
function getStatusKey(status: string): string {
  const statusKeys: Record<string, string> = {
    DRAFT: 'draft',
    PENDING_REVIEW: 'pendingReview',
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
  };
  return statusKeys[status] || 'draft';
}

// =============================================================================
// METRIC CARD COMPONENT
// =============================================================================

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  color?: 'default' | 'success' | 'warning' | 'info';
}

function MetricCard({ icon, label, value, subtitle, color = 'default' }: MetricCardProps) {
  const colorClasses = {
    default: 'bg-muted border-border',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    info: 'bg-secondary/10 border-secondary/20',
  };

  const iconColorClasses = {
    default: 'text-muted-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-secondary',
  };

  return (
    <Card className={`border ${colorClasses[color]}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${colorClasses[color]} ${iconColorClasses[color]}`}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// PROGRESS BAR COMPONENT
// =============================================================================

interface BudgetProgressProps {
  spent: number;
  total: number;
  utilization: number;
}

function BudgetProgress({ spent, total, utilization }: BudgetProgressProps) {
  const { t } = useTranslation('brands');

  // Determine color based on utilization
  const getBarColor = () => {
    if (utilization >= 90) return 'bg-red-500 dark:bg-red-400';
    if (utilization >= 70) return 'bg-amber-500 dark:bg-amber-400';
    return 'bg-green-500 dark:bg-green-400';
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-foreground">
            {t('campaignStats.metrics.budgetUtilization')}
          </h3>
          <span className="text-sm font-bold text-foreground">{formatPercent(utilization)}</span>
        </div>

        <div className="w-full bg-muted rounded-full h-3 mb-4">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${getBarColor()}`}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>

        <div className="flex justify-between text-sm">
          <div>
            <p className="text-muted-foreground">{t('campaignStats.metrics.budgetSpent')}</p>
            <p className="font-semibold text-foreground">{formatCurrency(spent)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">{t('campaignStats.metrics.budgetRemaining')}</p>
            <p className="font-semibold text-foreground">{formatCurrency(total - spent)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CampaignStats() {
  const { t } = useTranslation('brands');
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ===========================================================================
  // LOAD DATA
  // ===========================================================================

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      setIsLoading(true);
      setError(null);

      try {
        // Load campaign info and stats in parallel
        const [campaignResult, statsResult] = await Promise.all([
          campaignGet(id),
          campaignGetStats(id),
        ]);

        setCampaign(campaignResult.campaign);
        setStats(statsResult);
      } catch (err) {
        if (err instanceof BrandApiClientError) {
          if (err.code === 'NOT_FOUND') {
            setError(t('campaignStats.notFound'));
          } else {
            setError(err.message);
          }
        } else {
          setError(t('errors.loadFailed'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, t]);

  // ===========================================================================
  // RENDER STATES
  // ===========================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-muted">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <ErrorMessage title={t('errors.generic')}>
              {error || t('campaignStats.notFound')}
            </ErrorMessage>
            <Link to="/brands" className="mt-4 inline-block">
              <Button variant="outline">{t('common.back')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if there's any data to show
  const hasData = stats && (stats.impressions > 0 || stats.clicks > 0 || stats.budgetSpent > 0);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link to="/brands">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('common.back')}
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">
                {t('campaignStats.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('campaignStats.subtitle', { headline: campaign.headline })}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Campaign Info Card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {campaign.imageUrl && (
                <img
                  src={campaign.imageUrl}
                  alt={campaign.headline}
                  className="w-24 h-24 rounded-lg object-cover"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-lg font-bold text-foreground">{campaign.headline}</h2>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(
                      campaign.status
                    )}`}
                  >
                    {t(`status.${getStatusKey(campaign.status)}`)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{campaign.description}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {campaign.pricingModel === 'CPM' ? 'CPM' : 'CPC'}:{' '}
                    {formatCurrency(campaign.bidAmount)}
                  </span>
                  <span>
                    Budget: {formatCurrency(campaign.budgetTotal)}
                  </span>
                  <span className="text-secondary">
                    {t(`tokens.${campaign.paymentToken.toLowerCase()}`)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* No Data Message */}
        {!hasData && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {t('campaignStats.noData')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('campaignStats.noDataDescription')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Performance Metrics */}
        {hasData && stats && (
          <>
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Performance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <MetricCard
                icon={<Eye className="w-6 h-6" />}
                label={t('campaignStats.metrics.impressions')}
                value={formatNumber(stats.impressions)}
                color="info"
              />
              <MetricCard
                icon={<MousePointer className="w-6 h-6" />}
                label={t('campaignStats.metrics.clicks')}
                value={formatNumber(stats.clicks)}
                color="success"
              />
              <MetricCard
                icon={<TrendingUp className="w-6 h-6" />}
                label={t('campaignStats.metrics.ctr')}
                value={formatPercent(stats.ctr)}
                color="default"
              />
            </div>

            {/* Budget Section */}
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Budget
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <MetricCard
                icon={<DollarSign className="w-6 h-6" />}
                label={t('campaignStats.metrics.budgetSpent')}
                value={formatCurrency(stats.budgetSpent)}
                subtitle={`of ${formatCurrency(stats.budgetTotal)}`}
                color={stats.budgetUtilization >= 90 ? 'warning' : 'default'}
              />
              <MetricCard
                icon={<Wallet className="w-6 h-6" />}
                label={t('campaignStats.metrics.budgetRemaining')}
                value={formatCurrency(stats.budgetRemaining)}
                color={stats.budgetRemaining <= 0 ? 'warning' : 'success'}
              />
            </div>

            {/* Budget Progress */}
            <BudgetProgress
              spent={stats.budgetSpent}
              total={stats.budgetTotal}
              utilization={stats.budgetUtilization}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default CampaignStats;
