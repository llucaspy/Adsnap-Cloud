import { mockCampaigns } from '@/lib/campaign-data';
import HealthScore from '@/components/HealthScore';
import CampaignCards from '@/components/CampaignCards';
import { Activity } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground tracking-tight">AdOps Command Center</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">Google Ad Manager</span>
          <div className="h-2 w-2 rounded-full bg-on-track" title="Connected" />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">Delivery Performance Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mockCampaigns.filter(c => c.status === 'critical' || c.status === 'warning').length} campaigns at risk of under-delivery
          </p>
        </div>

        <HealthScore campaigns={mockCampaigns} />
        <CampaignCards campaigns={mockCampaigns} />
      </main>
    </div>
  );
};

export default Index;
