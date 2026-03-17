import { useState } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { type Campaign, type DeliveryStatus, getTimeElapsed, formatNumber } from '@/lib/campaign-data';
import PacingIndicator from './PacingIndicator';
import StatusBadge from './StatusBadge';
import MarginCell from './MarginCell';
import ViewabilityBar from './ViewabilityBar';

const filters: { label: string; value: DeliveryStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Under', value: 'warning' },
  { label: 'On Track', value: 'on-track' },
  { label: 'Over', value: 'over' },
];

const CampaignTable = ({ campaigns }: { campaigns: Campaign[] }) => {
  const [activeFilter, setActiveFilter] = useState<DeliveryStatus | 'all'>('all');

  const filtered = activeFilter === 'all'
    ? campaigns
    : campaigns.filter(c => c.status === activeFilter);

  return (
    <div className="bg-card rounded-lg overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Delivery Performance</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
            {activeFilter !== 'all' && ` · ${filters.find(f => f.value === activeFilter)?.label}`}
          </p>
        </div>
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                activeFilter === f.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Campaign', 'Period', 'Goal', 'Delivered', 'Pacing', 'Viewability', 'Status', 'Margin'].map(h => (
                <th key={h} className="label-text text-left px-4 py-2.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {filtered.map(campaign => {
                const timeElapsed = getTimeElapsed(campaign.startDate, campaign.endDate);
                return (
                  <motion.tr
                    key={campaign.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="row-hover border-b border-border/50 last:border-0 group"
                  >
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground">{campaign.advertiser}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {format(new Date(campaign.startDate), 'dd/MM')} – {format(new Date(campaign.endDate), 'dd/MM')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm tabular-nums">{formatNumber(campaign.goalImpressions)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm tabular-nums">{formatNumber(campaign.deliveredImpressions)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <PacingIndicator
                        delivered={campaign.deliveredImpressions}
                        goal={campaign.goalImpressions}
                        timeElapsed={timeElapsed}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ViewabilityBar value={campaign.viewability} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-4 py-3">
                      <MarginCell
                        delivered={campaign.deliveredImpressions}
                        goal={campaign.goalImpressions}
                        endDate={campaign.endDate}
                      />
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border flex justify-between items-center">
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} of {campaigns.length} campaigns
        </span>
        <span className="text-[11px] text-muted-foreground">
          Last updated: {format(new Date(), 'HH:mm')}
        </span>
      </div>
    </div>
  );
};

export default CampaignTable;
