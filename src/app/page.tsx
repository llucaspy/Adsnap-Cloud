import prisma from '@/lib/prisma'
import { startOfDay } from 'date-fns'
import { NexusCore } from '@/components/NexusCore'
import { LiveMetricStream } from '@/components/LiveMetricStream'
import { NeuralActivityFeed } from '@/components/NeuralActivityFeed'
import { CaptureSpotlight } from '@/components/CaptureSpotlight'
import Link from 'next/link'
import { ArrowRight, Box, Zap, Search } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PresentationHome() {
  const today = startOfDay(new Date())

  let stats = {
    totalCapturesToday: 0,
    activePis: 0,
    activeCampaigns: 0,
    totalFormats: 0,
    successRate: 100
  }
  let recentCaptures: any[] = []

  try {
    const [totalToday, failedToday, rawRecentCaptures] = await Promise.all([
      prisma.capture.count({ where: { createdAt: { gte: today }, status: 'SUCCESS' } }).catch(() => 0),
      prisma.capture.count({ where: { createdAt: { gte: today }, status: 'FAILED' } }).catch(() => 0),
      prisma.capture.findMany({
        where: { status: 'SUCCESS' },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { campaign: true }
      }).catch(() => [])
    ])

    const campaigns = await prisma.campaign.findMany({
      where: { isArchived: false }
    }).catch(() => [])

    const distinctPis = new Set((campaigns as any[]).map(c => c.pi)).size
    const distinctCampaigns = new Set((campaigns as any[]).map(c => `${c.pi}-${c.campaignName}`)).size
    const totalFormats = (campaigns as any[]).length

    recentCaptures = (rawRecentCaptures as any[])

    stats = {
      totalCapturesToday: totalToday,
      activePis: distinctPis,
      activeCampaigns: distinctCampaigns,
      totalFormats: totalFormats,
      successRate: totalToday + failedToday > 0
        ? Math.round((totalToday / (totalToday + failedToday)) * 100)
        : 100
    }
  } catch (err) {
    console.error('[LandingPage] Failed to fetch live metrics:', err)
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-24 py-20 relative overflow-hidden">
      {/* Background Atmosphere — parallax blobs */}
      <div className="parallax-slow absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-white/[0.025] rounded-full blur-[130px] pointer-events-none" />
      <div className="parallax-medium absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-white/[0.015] rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)] pointer-events-none" />

      {/* Hero Section */}
      <section className="flex flex-col items-center text-center space-y-8 relative z-10 max-w-4xl mx-auto px-6">
        <div className="animate-fade-in flex flex-col items-center">
          <NexusCore />

          <div className="mt-12 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
              <Zap size={12} className="animate-pulse" />
              Neural Intelligence Activated
            </div>

            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="text-white">ADS</span>
              <span className="text-gradient">NAP</span>
              <span className="text-white/15">.</span>
              <span className="text-white/60">ZERO</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/50 font-medium max-w-2xl mx-auto leading-relaxed">
              Automação de captura de mídia elevada ao estado da arte.
              Agendamentos múltiplos e monitoramento neural em tempo real pelo nexus AI.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-8 animate-slide-up">
          <Link
            href="/dashboard"
            className="px-10 py-5 bg-white rounded-2xl font-black text-black shadow-[0_0_50px_rgba(255,255,255,0.15)] hover:shadow-[0_0_80px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group"
          >
            Acessar Central de controle
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/monitoring"
            className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl font-black text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-3 backdrop-blur-md"
          >
            Gerenciar Fluxo
            <Box size={20} className="opacity-40" />
          </Link>
        </div>
      </section>

      {/* Neural Log Section */}
      <section className="w-full max-w-4xl mx-auto px-6 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        <div className="text-center mb-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30 mb-4">Deep Intelligence Log</h3>
          <NeuralActivityFeed />
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 px-6">
        <FeatureCard
          icon={Zap}
          title="Alta Performance"
          desc="Capturas sequenciais ultra-rápidas com sistema de fila inteligente."
          delay="scroll-delay-100"
        />
        <FeatureCard
          icon={Search}
          title="Monitoramento"
          desc="Visão em tempo real de cada pixel capturado na rede."
          delay="scroll-delay-200"
        />
        <FeatureCard
          icon={Box}
          title="API Nexus"
          desc="Integração profunda com IA para gerenciamento intuitivo."
          delay="scroll-delay-300"
        />
      </section>

      {/* Capture Spotlight */}
      <section className="w-full scroll-reveal-fade">
        <div className="text-center mb-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Visual Evidence Stream</h3>
        </div>
        <CaptureSpotlight captures={recentCaptures} />
      </section>

      {/* Live Metrics Overlay */}
      <section className="w-full pt-10 scroll-reveal">
        <div className="text-center mb-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Fluxo de Dados em Tempo Real</h3>
        </div>
        <LiveMetricStream stats={stats} />
      </section>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, desc, delay = '' }: any) {
  return (
    <div className={`scroll-reveal-scale ${delay} p-8 rounded-3xl bg-white/[0.02] border border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04] transition-all group`}>
      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mb-6 group-hover:bg-white/10 group-hover:border-white/15 transition-all">
        <Icon size={24} className="text-white/50 group-hover:text-white transition-colors" />
      </div>
      <h3 className="text-lg font-bold mb-3 text-white">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed">{desc}</p>
    </div>
  )
}
