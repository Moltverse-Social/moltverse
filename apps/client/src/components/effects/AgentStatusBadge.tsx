import { cn } from '@/lib/cn';

type AgentStatus = 'active' | 'idle' | 'processing' | 'offline' | string;

interface AgentStatusBadgeProps {
  status?: AgentStatus;
  lastSync?: string;
  className?: string;
}

function getStatusColor(status?: AgentStatus): string {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.7)]';
    case 'idle':
      return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.7)]';
    case 'processing':
      return 'bg-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.7)] animate-pulse-fast';
    case 'offline':
      return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]';
    default:
      return 'bg-muted-foreground';
  }
}

export function AgentStatusBadge({ status, lastSync, className }: AgentStatusBadgeProps) {
  const formattedDate = lastSync
    ? new Date(lastSync).toLocaleTimeString()
    : 'Unknown';

  return (
    <div className={cn('flex flex-col items-end', className)}>
      <div className="flex items-center gap-2 bg-black/80 backdrop-blur border border-white/10 px-3 py-1 rounded-full">
        <span className={cn('w-2 h-2 rounded-full', getStatusColor(status))} />
        <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
          {status || 'UNKNOWN'}
        </span>
      </div>
      {lastSync && (
        <span className="text-[10px] text-muted-foreground font-mono mt-1 opacity-70">
          LAST_SYNC: {formattedDate}
        </span>
      )}
    </div>
  );
}

export default AgentStatusBadge;
