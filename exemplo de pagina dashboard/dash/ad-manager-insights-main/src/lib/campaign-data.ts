export type DeliveryStatus = 'on-track' | 'warning' | 'critical' | 'over';

export interface Campaign {
  id: string;
  name: string;
  advertiser: string;
  startDate: string;
  endDate: string;
  goalImpressions: number;
  deliveredImpressions: number;
  viewability: number;
  status: DeliveryStatus;
}

export function getTimeElapsed(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now >= e) return 100;
  if (now <= s) return 0;
  return ((now - s) / (e - s)) * 100;
}

export function getPacing(delivered: number, goal: number): number {
  return (delivered / goal) * 100;
}

export function getMargin(delivered: number, goal: number): number {
  return delivered - goal;
}

export function getDaysRemaining(end: string): number {
  const diff = new Date(end).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getDailyNeeded(delivered: number, goal: number, end: string): number {
  const days = getDaysRemaining(end);
  if (days <= 0) return 0;
  const remaining = goal - delivered;
  return Math.max(0, Math.ceil(remaining / days));
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return n.toLocaleString();
}

export const mockCampaigns: Campaign[] = [
  {
    id: '1', name: 'Bradesco_Q1_Video_Premium', advertiser: 'Bradesco',
    startDate: '2026-01-15', endDate: '2026-03-31',
    goalImpressions: 2_000_000, deliveredImpressions: 1_420_000, viewability: 72.4, status: 'warning',
  },
  {
    id: '2', name: 'Itau_Brand_Awareness_Display', advertiser: 'Itaú',
    startDate: '2026-02-01', endDate: '2026-04-15',
    goalImpressions: 5_000_000, deliveredImpressions: 2_100_000, viewability: 68.1, status: 'critical',
  },
  {
    id: '3', name: 'Ambev_Carnaval_Takeover', advertiser: 'Ambev',
    startDate: '2026-02-10', endDate: '2026-03-10',
    goalImpressions: 3_000_000, deliveredImpressions: 3_150_000, viewability: 81.2, status: 'over',
  },
  {
    id: '4', name: 'Natura_Sustentabilidade_Native', advertiser: 'Natura',
    startDate: '2026-03-01', endDate: '2026-04-30',
    goalImpressions: 1_500_000, deliveredImpressions: 420_000, viewability: 75.8, status: 'on-track',
  },
  {
    id: '5', name: 'Magazine_Luiza_Retargeting', advertiser: 'Magalu',
    startDate: '2026-01-01', endDate: '2026-03-31',
    goalImpressions: 8_000_000, deliveredImpressions: 5_200_000, viewability: 62.3, status: 'critical',
  },
  {
    id: '6', name: 'Vivo_5G_Launch_Interstitial', advertiser: 'Vivo',
    startDate: '2026-03-05', endDate: '2026-04-05',
    goalImpressions: 4_000_000, deliveredImpressions: 1_800_000, viewability: 78.9, status: 'on-track',
  },
  {
    id: '7', name: 'Globo_Streaming_Pre-Roll', advertiser: 'Globoplay',
    startDate: '2026-02-15', endDate: '2026-03-25',
    goalImpressions: 6_000_000, deliveredImpressions: 5_850_000, viewability: 85.1, status: 'on-track',
  },
  {
    id: '8', name: 'C6Bank_Abertura_Conta', advertiser: 'C6 Bank',
    startDate: '2026-03-01', endDate: '2026-05-31',
    goalImpressions: 10_000_000, deliveredImpressions: 1_800_000, viewability: 71.0, status: 'warning',
  },
  {
    id: '9', name: 'Renner_Outono_Inverno_2026', advertiser: 'Renner',
    startDate: '2026-03-10', endDate: '2026-04-20',
    goalImpressions: 2_500_000, deliveredImpressions: 350_000, viewability: 69.5, status: 'on-track',
  },
  {
    id: '10', name: 'Petrobras_Institucional_Q1', advertiser: 'Petrobras',
    startDate: '2026-01-10', endDate: '2026-03-20',
    goalImpressions: 1_200_000, deliveredImpressions: 1_350_000, viewability: 77.3, status: 'over',
  },
  {
    id: '11', name: 'Nubank_Cartao_Ultra_Display', advertiser: 'Nubank',
    startDate: '2026-02-20', endDate: '2026-03-30',
    goalImpressions: 3_500_000, deliveredImpressions: 2_100_000, viewability: 64.8, status: 'critical',
  },
  {
    id: '12', name: 'Samsung_Galaxy_S26_Launch', advertiser: 'Samsung',
    startDate: '2026-03-12', endDate: '2026-04-12',
    goalImpressions: 7_000_000, deliveredImpressions: 900_000, viewability: 82.0, status: 'on-track',
  },
];
