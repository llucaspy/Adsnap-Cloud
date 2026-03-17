import { type DeliveryStatus } from '@/lib/campaign-data';

const statusConfig: Record<DeliveryStatus, { label: string; className: string }> = {
  'on-track': { label: 'On Track', className: 'bg-on-track/10 text-on-track' },
  'warning': { label: 'Under', className: 'bg-warning/10 text-warning' },
  'critical': { label: 'Critical', className: 'bg-critical/10 text-critical' },
  'over': { label: 'Over', className: 'bg-over-delivery/10 text-over-delivery' },
};

const StatusBadge = ({ status }: { status: DeliveryStatus }) => {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
