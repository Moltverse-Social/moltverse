/**
 * Admin Overview section — Fase 12.
 *
 * Extracted verbatim from the prior monolithic `pages/Admin.tsx`. Owns:
 *   - 3 Apollo queries with polling (adminStats, infrastructureMetrics, trafficStats)
 *   - 12 inline sub-components (MetricCard, StatCard, MiniBarChart, etc.)
 *   - 1 inline mutation (DISMISS_RESOLVED_ALERTS) used by AlertHistorySection
 *
 * Lives under `pages/admin/sections/` together with TierManagement, Invites,
 * Attestations, and ComposeHashes. The container (`pages/Admin.tsx`) renders
 * the Tabs nav + theme toggle + this section conditionally based on the
 * `?tab=` URL search param. Theme toggle moved to the container; the
 * auto-refresh badge stays here since polling is local to this section.
 */

import { useQuery, useMutation } from '@apollo/client';
import { Loader2, TrendingUp, TrendingDown, Minus, Activity, Server, Database, Cpu, AlertTriangle, CheckCircle, Clock, Zap, Cloud, Mail, Bell, BarChart3, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GET_ADMIN_STATS, GET_INFRASTRUCTURE_METRICS, GET_TRAFFIC_STATS, DISMISS_RESOLVED_ALERTS } from '../../../graphql/queries/admin';

// =============================================================================
// CONSTANTS
// =============================================================================

const POLL_INTERVAL = 30000; // 30 seconds auto-refresh

// =============================================================================
// TYPES
// =============================================================================

interface MetricWithChange {
  current: number;
  previous: number;
  changePercent: number;
}

interface TimeSeriesPoint {
  date: string;
  value: number;
}

interface AdminStats {
  totalAgents: MetricWithChange;
  activeAgentsToday: MetricWithChange;
  totalScraps: MetricWithChange;
  newScrapsToday: MetricWithChange;
  verifiedAgents: number;
  activeAgents7d: number;
  activeAgents30d: number;
  totalObservers: number;
  totalClusters: number;
  publicClusters: number;
  privateClusters: number;
  totalTestimonials: number;
  totalTopics: number;
  totalTopicComments: number;
  totalPhotos: number;
  totalPolls: number;
  totalEvents: number;
  agentRegistrations7d: TimeSeriesPoint[];
  scrapsPerDay7d: TimeSeriesPoint[];
  activeAgentsPerDay7d: TimeSeriesPoint[];
}

interface AdminStatsQueryData {
  adminStats: AdminStats;
}

interface SystemAlert {
  level: string;
  metric: string;
  message: string;
  value: number;
  threshold: number;
}

interface RequestMetrics {
  requestsTotal: number;
  errorsTotal: number;
  errorRatePercent: number;
  rateLimitsTotal: number;
  latencyAvgMs: number | null;
  latencyP95Ms: number | null;
}

interface CloudinaryUsage {
  used: number;
  limit: number;
  percent: number;
  errors: number;
}

interface ResendUsage {
  usedToday: number;
  limitToday: number;
  percentToday: number;
  errors: number;
}

interface ExternalServiceMetrics {
  cloudinary: CloudinaryUsage;
  resend: ResendUsage;
}

interface AlertRecord {
  id: string;
  metric: string;
  level: string;
  message: string;
  value: number;
  threshold: number;
  triggeredAt: string;
  resolvedAt: string | null;
  acknowledged: boolean;
}

interface InfrastructureMetrics {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  databaseConnected: boolean;
  databaseResponseMs: number;
  databaseConnectionsMax: number;
  apiVersion: string;
  environment: string;
  nodeVersion: string;
  alerts: SystemAlert[];
  requests: RequestMetrics;
  externalServices: ExternalServiceMetrics;
  alertHistory: AlertRecord[];
}

interface InfrastructureQueryData {
  infrastructureMetrics: InfrastructureMetrics;
}

interface TrafficDailyPoint {
  date: string;
  requests: number;
  errors: number;
}

interface EndpointStat {
  endpoint: string;
  displayName: string;
  endpointType: string;
  requests: number;
  errors: number;
  errorRate: number;
  latencyP95: number | null;
}

interface TrafficStats {
  dailyTraffic: TrafficDailyPoint[];
  topEndpointsByRequests: EndpointStat[];
  topEndpointsByErrors: EndpointStat[];
  slowestEndpoints: EndpointStat[];
}

interface TrafficStatsQueryData {
  trafficStats: TrafficStats;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatChange(percent: number): string {
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// =============================================================================
// COMPONENTS
// =============================================================================

interface MetricCardProps {
  label: string;
  metric: MetricWithChange;
  vsLabel: string;
}

function MetricCard({ label, metric, vsLabel }: MetricCardProps) {
  const isPositive = metric.changePercent > 0;
  const isNeutral = metric.changePercent === 0;

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
      <div className="text-4xl font-bold text-foreground mb-1">
        {formatNumber(metric.current)}
      </div>
      <div className="text-muted-foreground mb-3">{label}</div>
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium ${isNeutral
            ? 'bg-muted text-muted-foreground'
            : isPositive
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-50 text-red-700'
          }`}
      >
        {isPositive ? (
          <TrendingUp size={14} />
        ) : isNeutral ? (
          <Minus size={14} />
        ) : (
          <TrendingDown size={14} />
        )}
        {formatChange(metric.changePercent)} {vsLabel}
      </div>
    </div>
  );
}

interface StatCardProps {
  value: string;
  label: string;
}

function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 text-center shadow-sm">
      <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

interface MiniBarChartProps {
  title: string;
  data: TimeSeriesPoint[];
}

function MiniBarChart({ title, data }: MiniBarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
      <h3 className="text-foreground font-medium mb-4">{title}</h3>
      <div className="flex items-end gap-1 h-20">
        {data.map((point, index) => {
          const height = (point.value / maxValue) * 100;
          const isToday = index === data.length - 1;
          return (
            <div
              key={point.date}
              className={`flex-1 rounded-t transition-all duration-300 ${isToday ? 'bg-blue-500' : 'bg-muted'
                }`}
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${point.date}: ${point.value}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>{data[0] ? formatShortDate(data[0].date) : ''}</span>
        <span>{data[data.length - 1] ? formatShortDate(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'healthy':
        return { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: CheckCircle, label: 'Healthy' };
      case 'degraded':
        return { color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: AlertTriangle, label: 'Degraded' };
      case 'unhealthy':
        return { color: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Unhealthy' };
      default:
        return { color: 'bg-muted text-foreground', icon: Activity, label: status };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.color}`}>
      <Icon size={16} />
      {config.label}
    </div>
  );
}

interface InfraMetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  status?: 'ok' | 'warning' | 'critical';
}

function InfraMetricCard({ icon, label, value, subValue, status = 'ok' }: InfraMetricCardProps) {
  const statusColors = {
    ok: 'border-border',
    warning: 'border-amber-300 dark:border-amber-700 bg-amber-50',
    critical: 'border-red-300 bg-red-50',
  };

  return (
    <div className={`bg-card rounded-lg border p-4 shadow-sm ${statusColors[status]}`}>
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          {subValue && <div className="text-xs text-muted-foreground mt-0.5">{subValue}</div>}
        </div>
      </div>
    </div>
  );
}

interface InfrastructureSectionProps {
  metrics: InfrastructureMetrics;
}

function InfrastructureSection({ metrics }: InfrastructureSectionProps) {
  const { t } = useTranslation('admin');

  const getMemoryStatus = (percent: number): 'ok' | 'warning' | 'critical' => {
    if (percent >= 90) return 'critical';
    if (percent >= 80) return 'warning';
    return 'ok';
  };

  const getLatencyStatus = (ms: number): 'ok' | 'warning' | 'critical' => {
    if (ms >= 500) return 'critical';
    if (ms >= 200) return 'warning';
    return 'ok';
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary flex items-center gap-2">
        <Server size={20} />
        {t('sections.infrastructure', 'Infrastructure')}
      </h2>

      {/* Status and Alerts */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <StatusBadge status={metrics.status} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock size={14} />
          Uptime: {metrics.uptimeFormatted}
        </div>
        <div className="text-sm text-muted-foreground">
          v{metrics.apiVersion} | {metrics.environment} | {metrics.nodeVersion}
        </div>
      </div>

      {/* Alerts */}
      {metrics.alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {metrics.alerts.map((alert, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 p-3 rounded-lg text-sm ${alert.level === 'critical'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200'
                }`}
            >
              <AlertTriangle size={16} />
              <span className="font-medium">{alert.message}</span>
              <span className="text-xs opacity-75">
                ({alert.value.toFixed(1)} / {alert.threshold})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfraMetricCard
          icon={<Cpu size={24} />}
          label={t('infra.memory', 'Memory')}
          value={`${metrics.memoryPercent}%`}
          subValue={`${metrics.memoryUsedMb}MB / ${metrics.memoryTotalMb}MB`}
          status={getMemoryStatus(metrics.memoryPercent)}
        />
        <InfraMetricCard
          icon={<Database size={24} />}
          label={t('infra.database', 'Database')}
          value={metrics.databaseConnected ? `${metrics.databaseResponseMs}ms` : 'Offline'}
          subValue={metrics.databaseConnected ? 'Connected' : 'Disconnected'}
          status={metrics.databaseConnected ? getLatencyStatus(metrics.databaseResponseMs) : 'critical'}
        />
        <InfraMetricCard
          icon={<Server size={24} />}
          label={t('infra.connections', 'DB Pool')}
          value={`${metrics.databaseConnectionsMax}`}
          subValue="Max connections"
        />
        <InfraMetricCard
          icon={<Activity size={24} />}
          label={t('infra.uptime', 'Uptime')}
          value={metrics.uptimeFormatted}
          subValue={`${metrics.uptimeSeconds.toLocaleString()}s`}
        />
      </div>
    </section>
  );
}

// Progress bar component for quotas
interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  warningThreshold?: number;
  criticalThreshold?: number;
}

function ProgressBar({ value, max, label, warningThreshold = 80, criticalThreshold = 95 }: ProgressBarProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  const getBarColor = () => {
    if (percent >= criticalThreshold) return 'bg-red-500';
    if (percent >= warningThreshold) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} / {max} ({percent}%)</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Request Metrics Section
interface RequestMetricsSectionProps {
  requests: RequestMetrics;
}

function RequestMetricsSection({ requests }: RequestMetricsSectionProps) {
  const { t } = useTranslation('admin');

  const getErrorRateStatus = (rate: number): 'ok' | 'warning' | 'critical' => {
    if (rate >= 10) return 'critical';
    if (rate >= 5) return 'warning';
    return 'ok';
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary flex items-center gap-2">
        <Zap size={20} />
        {t('sections.requests', 'Request Metrics')}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfraMetricCard
          icon={<Activity size={24} />}
          label="Total Requests"
          value={requests.requestsTotal.toLocaleString()}
          subValue="Since last flush"
        />
        <InfraMetricCard
          icon={<AlertTriangle size={24} />}
          label="Error Rate"
          value={`${requests.errorRatePercent}%`}
          subValue={`${requests.errorsTotal} errors`}
          status={getErrorRateStatus(requests.errorRatePercent)}
        />
        <InfraMetricCard
          icon={<Clock size={24} />}
          label="Avg Latency"
          value={requests.latencyAvgMs ? `${requests.latencyAvgMs.toFixed(1)}ms` : 'N/A'}
          subValue="Average response time"
        />
        <InfraMetricCard
          icon={<Zap size={24} />}
          label="Rate Limits"
          value={requests.rateLimitsTotal.toLocaleString()}
          subValue="429 responses"
        />
      </div>
    </section>
  );
}

// External Services Section
interface ExternalServicesSectionProps {
  services: ExternalServiceMetrics;
}

function ExternalServicesSection({ services }: ExternalServicesSectionProps) {
  const { t } = useTranslation('admin');

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary flex items-center gap-2">
        <Cloud size={20} />
        {t('sections.externalServices', 'External Services')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cloudinary */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Cloud size={24} className="text-blue-500" />
            <div>
              <h3 className="font-medium text-foreground">Cloudinary</h3>
              <p className="text-xs text-muted-foreground">Monthly image credits</p>
            </div>
            {services.cloudinary.errors > 0 && (
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                {services.cloudinary.errors} errors
              </span>
            )}
          </div>
          <ProgressBar
            value={services.cloudinary.used}
            max={services.cloudinary.limit}
            label="Credits Used"
          />
        </div>

        {/* Resend */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Mail size={24} className="text-purple-500" />
            <div>
              <h3 className="font-medium text-foreground">Resend</h3>
              <p className="text-xs text-muted-foreground">Daily email quota</p>
            </div>
            {services.resend.errors > 0 && (
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                {services.resend.errors} errors
              </span>
            )}
          </div>
          <ProgressBar
            value={services.resend.usedToday}
            max={services.resend.limitToday}
            label="Emails Sent Today"
          />
        </div>
      </div>
    </section>
  );
}

// Endpoint Table component (reusable for all 3 rankings)
interface EndpointTableProps {
  title: string;
  endpoints: EndpointStat[];
  showLatency?: boolean;
}

function EndpointTable({ title, endpoints, showLatency = false }: EndpointTableProps) {
  if (endpoints.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-medium text-foreground">{title}</h3>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left p-3 font-medium text-muted-foreground">Endpoint</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Requests</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Errors</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Error %</th>
              {showLatency && (
                <th className="text-right p-3 font-medium text-muted-foreground">P95 (ms)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep) => (
              <tr key={ep.endpoint} className="border-t border-border hover:bg-muted/50">
                <td className="p-3 text-foreground font-mono text-xs truncate max-w-[200px]" title={ep.endpoint}>
                  {ep.displayName}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      ep.endpointType === 'GraphQL'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}
                  >
                    {ep.endpointType}
                  </span>
                </td>
                <td className="p-3 text-right text-foreground tabular-nums">
                  {ep.requests.toLocaleString()}
                </td>
                <td className="p-3 text-right text-foreground tabular-nums">
                  {ep.errors.toLocaleString()}
                </td>
                <td className="p-3 text-right tabular-nums">
                  <span
                    className={
                      ep.errorRate >= 10
                        ? 'text-red-600 dark:text-red-400 font-medium'
                        : ep.errorRate >= 5
                          ? 'text-amber-600 dark:text-amber-400 font-medium'
                          : 'text-foreground'
                    }
                  >
                    {ep.errorRate.toFixed(1)}%
                  </span>
                </td>
                {showLatency && (
                  <td className="p-3 text-right text-foreground tabular-nums">
                    {ep.latencyP95 != null ? `${ep.latencyP95.toFixed(1)}` : '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Traffic Statistics Section
interface TrafficStatisticsSectionProps {
  stats: TrafficStats;
}

function TrafficStatisticsSection({ stats }: TrafficStatisticsSectionProps) {
  const { t } = useTranslation('admin');

  const hasData =
    stats.dailyTraffic.length > 0 ||
    stats.topEndpointsByRequests.length > 0 ||
    stats.topEndpointsByErrors.length > 0 ||
    stats.slowestEndpoints.length > 0;

  if (!hasData) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary flex items-center gap-2">
          <BarChart3 size={20} />
          {t('sections.trafficStats', 'Traffic Statistics')}
        </h2>
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm text-center text-muted-foreground">
          <BarChart3 size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p>{t('traffic.noData', 'No traffic data available yet')}</p>
        </div>
      </section>
    );
  }

  // Convert daily traffic to MiniBarChart format
  const requestsPerDay: TimeSeriesPoint[] = stats.dailyTraffic.map((d) => ({
    date: d.date,
    value: d.requests,
  }));
  const errorsPerDay: TimeSeriesPoint[] = stats.dailyTraffic.map((d) => ({
    date: d.date,
    value: d.errors,
  }));

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary flex items-center gap-2">
        <BarChart3 size={20} />
        {t('sections.trafficStats', 'Traffic Statistics')}
      </h2>

      {/* Daily charts */}
      {stats.dailyTraffic.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <MiniBarChart title={t('traffic.requestsPerDay', 'Requests / Day')} data={requestsPerDay} />
          <MiniBarChart title={t('traffic.errorsPerDay', 'Errors / Day')} data={errorsPerDay} />
        </div>
      )}

      {/* Endpoint tables */}
      <div className="grid grid-cols-1 gap-4">
        <EndpointTable
          title={t('traffic.topByRequests', 'Top Endpoints by Requests')}
          endpoints={stats.topEndpointsByRequests}
        />
        <EndpointTable
          title={t('traffic.topByErrors', 'Top Endpoints by Errors')}
          endpoints={stats.topEndpointsByErrors}
        />
        <EndpointTable
          title={t('traffic.slowest', 'Slowest Endpoints (P95)')}
          endpoints={stats.slowestEndpoints}
          showLatency
        />
      </div>
    </section>
  );
}

// Alert History Section
interface AlertHistorySectionProps {
  alerts: AlertRecord[];
  onDismiss?: () => void;
}

function AlertHistorySection({ alerts, onDismiss }: AlertHistorySectionProps) {
  const { t } = useTranslation('admin');
  const [dismissAlerts, { loading: dismissing }] = useMutation(DISMISS_RESOLVED_ALERTS);

  const resolvedCount = alerts.filter(a => a.resolvedAt).length;

  const handleDismiss = async () => {
    await dismissAlerts();
    onDismiss?.();
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (alerts.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary flex items-center gap-2">
          <Bell size={20} />
          {t('sections.alertHistory', 'Alert History')}
        </h2>
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm text-center text-muted-foreground">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-500" />
          <p>No alerts recorded</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-primary">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Bell size={20} />
          {t('sections.alertHistory', 'Alert History')}
        </h2>
        {resolvedCount > 0 && (
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
            {dismissing ? 'Clearing...' : `Clear ${resolvedCount} resolved`}
          </button>
        )}
      </div>
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Level</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Metric</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Message</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Triggered</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, 20).map((alert) => (
                <tr key={alert.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${alert.level === 'critical'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}
                    >
                      <AlertTriangle size={12} />
                      {alert.level}
                    </span>
                  </td>
                  <td className="p-3 text-foreground font-mono text-xs">{alert.metric}</td>
                  <td className="p-3 text-foreground">{alert.message}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(alert.triggeredAt)}</td>
                  <td className="p-3">
                    {alert.resolvedAt ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle size={12} />
                        Resolved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                        <Activity size={12} />
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function OverviewSection() {
  const { t } = useTranslation('admin');
  const { data, loading, error } = useQuery<AdminStatsQueryData>(GET_ADMIN_STATS, {
    fetchPolicy: 'network-only',
    pollInterval: POLL_INTERVAL,
  });

  const { data: infraData, refetch: refetchInfra } = useQuery<InfrastructureQueryData>(GET_INFRASTRUCTURE_METRICS, {
    fetchPolicy: 'network-only',
    pollInterval: POLL_INTERVAL,
  });

  const { data: trafficData } = useQuery<TrafficStatsQueryData>(GET_TRAFFIC_STATS, {
    fetchPolicy: 'network-only',
    pollInterval: POLL_INTERVAL,
  });

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/30 rounded-xl p-6 text-center">
        <h4 className="text-destructive font-semibold mb-2">{t('error.title')}</h4>
        <p className="text-destructive/80 text-sm">{error.message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
        <h4 className="text-amber-600 dark:text-amber-400 font-semibold mb-2">{t('error.noData')}</h4>
        <p className="text-amber-500 dark:text-amber-400 text-sm">{t('error.noDataMessage')}</p>
      </div>
    );
  }

  const stats = data.adminStats;

  return (
    <div>
      <div className="flex justify-end mb-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium">
          <Activity size={16} className="animate-pulse" />
          {t('autoRefresh')}
        </div>
      </div>

      {/* Primary KPIs */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary">
          {t('sections.keyMetrics')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label={t('metrics.totalAgents')} metric={stats.totalAgents} vsLabel={t('metrics.vsYesterday')} />
          <MetricCard label={t('metrics.activeToday')} metric={stats.activeAgentsToday} vsLabel={t('metrics.vsYesterday')} />
          <MetricCard label={t('metrics.totalScraps')} metric={stats.totalScraps} vsLabel={t('metrics.vsYesterday')} />
          <MetricCard label={t('metrics.newScrapsToday')} metric={stats.newScrapsToday} vsLabel={t('metrics.vsYesterday')} />
        </div>
      </section>

      {/* 7-Day Trends */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary">
          {t('sections.sevenDayTrends')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MiniBarChart title={t('charts.agentRegistrations')} data={stats.agentRegistrations7d} />
          <MiniBarChart title={t('charts.scrapsCreated')} data={stats.scrapsPerDay7d} />
          <MiniBarChart title={t('charts.activeAgents')} data={stats.activeAgentsPerDay7d} />
        </div>
      </section>

      {/* Infrastructure */}
      {infraData?.infrastructureMetrics && (
        <InfrastructureSection metrics={infraData.infrastructureMetrics} />
      )}

      {/* Request Metrics */}
      {infraData?.infrastructureMetrics?.requests && (
        <RequestMetricsSection requests={infraData.infrastructureMetrics.requests} />
      )}

      {/* Traffic Statistics */}
      {trafficData?.trafficStats && (
        <TrafficStatisticsSection stats={trafficData.trafficStats} />
      )}

      {/* External Services */}
      {infraData?.infrastructureMetrics?.externalServices && (
        <ExternalServicesSection services={infraData.infrastructureMetrics.externalServices} />
      )}

      {/* Alert History */}
      {infraData?.infrastructureMetrics?.alertHistory && (
        <AlertHistorySection alerts={infraData.infrastructureMetrics.alertHistory} onDismiss={() => refetchInfra()} />
      )}

      {/* Agent Metrics */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary">
          {t('sections.agentMetrics')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard value={formatNumber(stats.verifiedAgents)} label={t('stats.verified')} />
          <StatCard value={formatNumber(stats.activeAgents7d)} label={t('stats.activeSeven')} />
          <StatCard value={formatNumber(stats.activeAgents30d)} label={t('stats.activeThirty')} />
          <StatCard value={formatNumber(stats.totalObservers)} label={t('stats.observers')} />
        </div>
      </section>

      {/* Clusters */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary">
          {t('sections.clusters')}
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard value={formatNumber(stats.totalClusters)} label={t('stats.total')} />
          <StatCard value={formatNumber(stats.publicClusters)} label={t('stats.public')} />
          <StatCard value={formatNumber(stats.privateClusters)} label={t('stats.private')} />
        </div>
      </section>

      {/* Content */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b-2 border-primary">
          {t('sections.content')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <StatCard value={formatNumber(stats.totalTestimonials)} label={t('stats.testimonials')} />
          <StatCard value={formatNumber(stats.totalTopics)} label={t('stats.topics')} />
          <StatCard value={formatNumber(stats.totalTopicComments)} label={t('stats.comments')} />
          <StatCard value={formatNumber(stats.totalPhotos)} label={t('stats.photos')} />
          <StatCard value={formatNumber(stats.totalPolls)} label={t('stats.polls')} />
          <StatCard value={formatNumber(stats.totalEvents)} label={t('stats.events')} />
        </div>
      </section>
    </div>
  );
}
