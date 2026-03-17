const ViewabilityBar = ({ value }: { value: number }) => {
  const color = value >= 70 ? 'bg-on-track' : value >= 50 ? 'bg-warning' : 'bg-critical';

  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="relative h-1.5 w-14 bg-secondary rounded-sm overflow-hidden">
        <div className={`h-full ${color} rounded-sm`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-foreground">{value.toFixed(1)}%</span>
    </div>
  );
};

export default ViewabilityBar;
