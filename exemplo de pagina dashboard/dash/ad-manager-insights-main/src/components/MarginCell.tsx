import { formatNumber, getDailyNeeded } from '@/lib/campaign-data';
import { AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MarginCellProps {
  delivered: number;
  goal: number;
  endDate: string;
}

const MarginCell = ({ delivered, goal, endDate }: MarginCellProps) => {
  const margin = delivered - goal;
  const isNegative = margin < 0;
  const dailyNeeded = getDailyNeeded(delivered, goal, endDate);

  if (!isNegative) {
    return (
      <span className="font-mono text-sm tabular-nums text-on-track">
        +{formatNumber(margin)}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 font-mono text-sm tabular-nums text-critical cursor-default">
          <AlertTriangle className="h-3 w-3" />
          {formatNumber(margin)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>Needs <strong className="font-mono">{formatNumber(dailyNeeded)}</strong> imps/day to finish on time</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default MarginCell;
