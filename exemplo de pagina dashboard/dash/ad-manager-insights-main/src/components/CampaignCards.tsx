import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type Campaign, type DeliveryStatus, getTimeElapsed, formatNumber, getDailyNeeded, getDaysRemaining } from '@/lib/campaign-data';
import PacingIndicator from './PacingIndicator';
import StatusBadge from './StatusBadge';
import { Calendar, Target, Eye, TrendingDown, TrendingUp, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const filters: { label: string; value: DeliveryStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Under', value: 'warning' },
  { label: 'On Track', value: 'on-track' },
  { label: 'Over', value: 'over' },
];

const CampaignCard = ({ campaign }: { campaign: Campaign }) => {
  const [expanded, setExpanded] = useState(false);
  const timeElapsed = getTimeElapsed(campaign.startDate, campaign.endDate);
  const margin = campaign.deliveredImpressions - campaign.goalImpressions;
  const daysLeft = getDaysRemaining(campaign.endDate);
  const dailyNeeded = getDailyNeeded(campaign.deliveredImpressions, campaign.goalImpressions, campaign.endDate);
  const pacing = (campaign.deliveredImpressions / campaign.goalImpressions) * 100;

  const marginBg = margin < 0
    ? campaign.status === 'critical' ? 'bg-critical/5' : 'bg-warning/5'
    : margin > 0 ? 'bg-on-track/5' : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="bg-card rounded-lg cursor-pointer group"
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4 space-y-3">
        {/* Top row: name + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{campaign.name}</p>
            <p className="text-[11px] text-muted-foreground">{campaign.advertiser}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={campaign.status} />
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Pacing bar */}
        <PacingIndicator
          delivered={campaign.deliveredImpressions}
          goal={campaign.goalImpressions}
          timeElapsed={timeElapsed}
        />

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivered</p>
            <p className="font-mono text-sm tabular-nums font-medium text-foreground">
              {formatNumber(campaign.deliveredImpressions)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Goal</p>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatNumber(campaign.goalImpressions)}
            </p>
          </div>
          <div className={`rounded-md px-1.5 py-0.5 -mx-1.5 ${marginBg}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Margin</p>
            <p className={`font-mono text-sm tabular-nums font-medium ${
              margin < 0 ? 'text-critical' : 'text-on-track'
            }`}>
              {margin >= 0 ? '+' : ''}{formatNumber(margin)}
            </p>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Period</p>
                    <p className="font-mono text-xs tabular-nums">
                      {format(new Date(campaign.startDate), 'dd/MM/yy')} – {format(new Date(campaign.endDate), 'dd/MM/yy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Viewability</p>
                    <p className={`font-mono text-xs tabular-nums font-medium ${
                      campaign.viewability >= 70 ? 'text-on-track' : 'text-warning'
                    }`}>
                      {campaign.viewability.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Days Left</p>
                    <p className="font-mono text-xs tabular-nums">{daysLeft}</p>
                  </div>
                </div>
                {margin < 0 && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-critical" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Daily Needed</p>
                      <p className="font-mono text-xs tabular-nums text-critical font-medium">
                        {formatNumber(dailyNeeded)}/day
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const CampaignCards = ({ campaigns }: { campaigns: Campaign[] }) => {
  const [activeFilter, setActiveFilter] = useState<DeliveryStatus | 'all'>('all');

  const filtered = activeFilter === 'all'
    ? campaigns
    : campaigns.filter(c => c.status === activeFilter);

  const counts = {
    all: campaigns.length,
    critical: campaigns.filter(c => c.status === 'critical').length,
    warning: campaigns.filter(c => c.status === 'warning').length,
    'on-track': campaigns.filter(c => c.status === 'on-track').length,
    over: campaigns.filter(c => c.status === 'over').length,
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeFilter === f.value
                ? 'bg-foreground text-background'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            style={activeFilter !== f.value ? { boxShadow: 'var(--shadow-card)' } : {}}
          >
            {f.label}
            <span className="ml-1.5 opacity-60">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <AnimatePresence mode="popLayout">
          {filtered.map(campaign => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CampaignCards;
