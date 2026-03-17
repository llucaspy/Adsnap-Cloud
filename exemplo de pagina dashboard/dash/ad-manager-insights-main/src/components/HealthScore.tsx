import { type Campaign } from '@/lib/campaign-data';
import { motion } from 'framer-motion';

const HealthScore = ({ campaigns }: { campaigns: Campaign[] }) => {
  const total = campaigns.length;
  const onTrack = campaigns.filter(c => c.status === 'on-track' || c.status === 'over').length;
  const score = Math.round((onTrack / total) * 100);
  const atRisk = campaigns.filter(c => c.status === 'critical' || c.status === 'warning').length;

  const totalDelivered = campaigns.reduce((s, c) => s + c.deliveredImpressions, 0);
  const totalGoal = campaigns.reduce((s, c) => s + c.goalImpressions, 0);
  const avgViewability = campaigns.reduce((s, c) => s + c.viewability, 0) / total;

  const formatM = (n: number) => (n / 1_000_000).toFixed(1) + 'M';

  const stats = [
    { label: 'Health Score', value: `${score}%`, sub: `${onTrack}/${total} on track` },
    { label: 'At Risk', value: String(atRisk), sub: 'campaigns', highlight: atRisk > 0 },
    { label: 'Total Delivered', value: formatM(totalDelivered), sub: `of ${formatM(totalGoal)} goal` },
    { label: 'Avg. Viewability', value: `${avgViewability.toFixed(1)}%`, sub: avgViewability >= 70 ? 'Above threshold' : 'Below 70%' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          className="bg-card rounded-lg p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <p className="label-text mb-2">{s.label}</p>
          <p className={`metric-display ${s.highlight ? 'text-critical' : 'text-foreground'}`}>
            {s.value}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
        </motion.div>
      ))}
    </div>
  );
};

export default HealthScore;
