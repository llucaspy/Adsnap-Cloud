import prisma from '@/lib/prisma'
import { startOfDay } from 'date-fns'
import { LiveMetricStream } from '@/components/LiveMetricStream'
import { NeuralActivityFeed } from '@/components/NeuralActivityFeed'
import { CaptureSpotlight } from '@/components/CaptureSpotlight'
import Link from 'next/link'
import { ArrowRight, Activity, Layers, Cpu, TrendingUp } from 'lucide-react'
import { ScrollReveal } from '@/components/ScrollReveal'

export const revalidate = 30

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
        include: { campaign: true, baseCapture: true }
      }).catch(() => [])
    ])

    const campaigns = await prisma.campaign.findMany({
      where: { isArchived: false }
    }).catch(() => [])

    const distinctPis = new Set((campaigns as any[]).map(c => c.pi)).size
    const distinctCampaigns = new Set((campaigns as any[]).map(c => `${c.pi}-${c.campaignName}`)).size
    const totalFormats = (campaigns as any[]).length

    recentCaptures = rawRecentCaptures as any[]

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
    <main className="page-enter" style={{ minHeight: '100vh', background: 'var(--bg-primary)', overflowX: 'hidden' }}>

      {/* Grain Overlay */}
      <div className="grain-overlay" />

      {/* ── HERO SECTION ─────────────────────────────────────── */}
      <section style={{
        position: 'relative',
        paddingTop: '64px',
        paddingBottom: '64px',
        maxWidth: '1280px', margin: '0 auto', paddingLeft: '32px', paddingRight: '32px'
      }}>
        <div style={{
          display: 'inline-flex',
          background: 'rgba(255,255,255,0.04)',
          color: '#a3a3a3',
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.07em',
          borderRadius: '4px',
          padding: '2px 8px',
          marginBottom: '24px'
        }}>
          ADSNAP CLOUD
        </div>

        {/* Headline editorial */}
        <h1 style={{
          fontSize: '56px',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-1px',
          color: '#ffffff',
          fontFamily: 'var(--font-display)',
          marginBottom: '24px',
          maxWidth: '600px',
        }}>
          Automação de mídia elevada ao estado da arte.
        </h1>

        {/* Subtítulo */}
        <p style={{
          fontSize: '15px',
          fontWeight: 400,
          lineHeight: 1.6,
          color: '#a3a3a3',
          maxWidth: '460px',
          marginBottom: '48px',
        }}>
          Dispare criativos em múltiplas mídias, gerencie aprovações e acompanhe performance em tempo real.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Link href="/dashboard" className="btn-primary hover-lift" style={{ padding: '14px 28px', fontSize: '15px' }}>
            Central de Controle
          </Link>
          <Link href="/monitoring" className="btn-secondary hover-lift" style={{ padding: '14px 28px', fontSize: '15px' }}>
             Ver Monitoramento
          </Link>
        </div>

        {/* Realistic Mockup — Light shadow no glow */}
        <div className="reveal" style={{
          marginTop: '64px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'rgba(0,0,0,0.50) 0px 32px 64px -8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Browser Bar */}
          <div style={{
            background: '#141414',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#525252' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#525252' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#525252' }} />
            </div>
            <div style={{
              flex: 1, margin: '0 16px', height: '28px', background: '#141414',
              borderRadius: '6px', border: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', color: '#a3a3a3',
            }}>
              nexus.adsnap.cloud
            </div>
          </div>
          {/* Dashboard Content */}
          <div style={{ background: '#141414', padding: '40px 32px' }}>
            <NeuralActivityFeed />
          </div>
        </div>
      </section>

      {/* ── MÉTRICAS AO VIVO — layout assimétrico 2/3 + 1/3 ── */}
      <ScrollReveal>
        <section style={{
          padding: '96px 32px',
          maxWidth: '1280px',
          margin: '0 auto',
        }}>
          <div style={{ marginBottom: '48px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a3a3a3', marginBottom: '12px' }}>
              Fluxo em Tempo Real
            </p>
            <h2 style={{
              fontSize: 'clamp(30px, 4vw, 42px)',
              fontWeight: 600,
              lineHeight: 1.2,
              letterSpacing: '-0.5px',
              color: '#ffffff',
              maxWidth: '480px',
            }}>
              Dados que respiram com seu negócio.
            </h2>
          </div>
          <LiveMetricStream stats={stats} />
        </section>
      </ScrollReveal>

      {/* ── FEATURE GRID ASSIMÉTRICA — 1 grande + 2 médios ─── */}
      <section style={{
        padding: '0 32px 96px',
        maxWidth: '1280px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateRows: 'auto auto',
          gap: '16px',
        }}>
          {/* Card GRANDE — ocupa 7 colunas */}
          <ScrollReveal className="stagger-1" style={{ gridColumn: '1 / 8', gridRow: '1 / 2' }}>
            <FeatureCardLarge
              icon={Cpu}
              label="Motor Neural"
              title="Capturas sequenciais ultra‑rápidas"
              desc="O sistema de fila inteligente do Nexus processa múltiplos formatos em paralelo, priorizando campanhas de alta urgência sem degradar a performance dos demais fluxos."
              accent="rgba(255,255,255,0.08)"
            />
          </ScrollReveal>

          {/* Card MÉDIO direito superior */}
          <ScrollReveal className="stagger-2" style={{ gridColumn: '8 / 13', gridRow: '1 / 2' }}>
            <FeatureCardMedium
              icon={Activity}
              label="Monitoramento"
              title="Visibilidade total em cada pixel"
              desc="Feed neural em tempo real: cada captura rastreada, cada falha detectada antes de virar problema."
            />
          </ScrollReveal>

          {/* Card MÉDIO esquerdo inferior */}
          <ScrollReveal className="stagger-3" style={{ gridColumn: '1 / 6', gridRow: '2 / 3' }}>
            <FeatureCardMedium
              icon={Layers}
              label="API Nexus"
              title="Integração profunda com IA"
              desc="Comandos em linguagem natural. Relatórios gerados em segundos. Gerenciamento intuitivo de qualquer dispositivo."
            />
          </ScrollReveal>

          {/* Card MÉTRICA direito inferior */}
          <ScrollReveal className="stagger-4" style={{ gridColumn: '6 / 13', gridRow: '2 / 3' }}>
            <FeatureCardStat
              icon={TrendingUp}
              stat={`${stats.successRate}%`}
              label="Taxa de sucesso"
              desc="capturas executadas com erro zero hoje"
              value={stats.totalCapturesToday}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* ── CAPTURE SPOTLIGHT ──────────────────────────────── */}
      <ScrollReveal>
        <section style={{
          padding: '0 0 96px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '64px 32px 0' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a3a3a3', marginBottom: '12px' }}>
              Visual Evidence Stream
            </p>
            <h2 style={{
              fontSize: 'clamp(24px, 3vw, 36px)',
              fontWeight: 600,
              letterSpacing: '-0.5px',
              color: '#ffffff',
              marginBottom: '48px',
            }}>
              Capturas recentes verificadas
            </h2>
          </div>
          <CaptureSpotlight captures={recentCaptures} />
        </section>
      </ScrollReveal>

    </main>
  )
}

/* ── Componentes de Card Light Theme ─────────────────────────────────── */

function FeatureCardLarge({ icon: Icon, label, title, desc, accent }: any) {
  return (
    <div className="hover-lift" style={{
      padding: '40px',
      height: '100%',
      minHeight: '280px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        width: '44px', height: '44px',
        background: accent || 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '28px',
      }}>
        <Icon size={20} style={{ color: '#f5f5f5' }} />
      </div>
      <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a3a3a3', marginBottom: '10px' }}>
        {label}
      </p>
      <h3 style={{ fontSize: '22px', fontWeight: 600, lineHeight: 1.3, color: '#ffffff', marginBottom: '14px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '14px', lineHeight: 1.65, color: '#a3a3a3', maxWidth: '440px' }}>
        {desc}
      </p>
    </div>
  )
}

function FeatureCardMedium({ icon: Icon, label, title, desc }: any) {
  return (
    <div className="hover-lift" style={{
      padding: '32px',
      height: '100%',
      minHeight: '200px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
    }}>
      <div style={{
        width: '36px', height: '36px',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <Icon size={16} style={{ color: '#f5f5f5' }} />
      </div>
      <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a3a3a3', marginBottom: '8px' }}>
        {label}
      </p>
      <h3 style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.3, color: '#ffffff', marginBottom: '10px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#a3a3a3' }}>
        {desc}
      </p>
    </div>
  )
}

function FeatureCardStat({ icon: Icon, stat, label, desc, value }: any) {
  return (
    <div className="hover-lift" style={{
      padding: '32px',
      height: '100%',
      minHeight: '200px',
      background: 'rgba(255,255,255,0.10)',
      border: '1px solid rgba(255,255,255,0.26)',
      borderRadius: '12px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', bottom: '-20px', right: '-20px',
        fontSize: '96px', fontWeight: 700,
        color: 'rgba(255,255,255,0.16)',
        lineHeight: 1, letterSpacing: '-4px',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        {stat}
      </div>
      <div style={{
        width: '36px', height: '36px',
        background: 'rgba(255,255,255,0.14)',
        border: '1px solid rgba(255,255,255,0.24)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <Icon size={16} style={{ color: '#f5f5f5' }} />
      </div>
      <div style={{ fontSize: '42px', fontWeight: 700, letterSpacing: '-1px', color: '#ffffff', lineHeight: 1, marginBottom: '8px' }}>
        {stat}
      </div>
      <p style={{ fontSize: '14px', fontWeight: 500, color: '#ffffff', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '12px', color: '#a3a3a3' }}>
        {value > 0 ? `${value} ${desc}` : `Nenhuma captura ${desc.replace('capturas executadas com erro zero ', '')}`}
      </p>
    </div>
  )
}
