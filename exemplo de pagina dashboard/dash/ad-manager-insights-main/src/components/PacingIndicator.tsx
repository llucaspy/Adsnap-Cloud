import { motion } from 'framer-motion';

interface PacingIndicatorProps {
  delivered: number;
  goal: number;
  timeElapsed: number;
}

const PacingIndicator = ({ delivered, goal, timeElapsed }: PacingIndicatorProps) => {
  const pace = Math.min((delivered / goal) * 100, 120);
  const isUnder = pace < timeElapsed - 2;
  const isOver = pace > 100;

  const barColor = isOver
    ? 'bg-over-delivery'
    : isUnder
      ? pace < timeElapsed - 10
        ? 'bg-critical'
        : 'bg-warning'
      : 'bg-on-track';

  return (
    <div className="w-full min-w-[140px] space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-mono text-[10px] tabular-nums text-foreground">
          {pace.toFixed(1)}%
        </span>
        <span className={`text-[10px] font-medium ${
          isOver ? 'text-over-delivery' : isUnder ? (pace < timeElapsed - 10 ? 'text-critical' : 'text-warning') : 'text-on-track'
        }`}>
          {isOver ? 'Over' : isUnder ? 'Under' : 'On-track'}
        </span>
      </div>
      <div className="relative h-1.5 w-full bg-secondary rounded-sm overflow-hidden">
        <div
          className="absolute top-0 bottom-0 border-r border-muted-foreground/40 z-10"
          style={{ left: `${Math.min(timeElapsed, 100)}%` }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pace, 100)}%` }}
          className={`h-full ${barColor} rounded-sm`}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
    </div>
  );
};

export default PacingIndicator;
