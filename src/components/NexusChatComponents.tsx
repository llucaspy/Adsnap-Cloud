'use client'

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

// --- MERMAID DIAGRAM COMPONENT ---

export function MermaidChart({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'Inter, sans-serif'
    })

    const renderChart = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg: svgContent } = await mermaid.render(id, chart)
        setSvg(svgContent)
      } catch (err) {
        console.error('Mermaid render error:', err)
      }
    }

    renderChart()
  }, [chart])

  return (
    <div 
      ref={ref} 
      className="my-4 p-4 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// --- RECHARTS DATA VISUALIZER ---

interface ChartData {
  type: 'area' | 'bar' | 'pie'
  data: any[]
  keys: string[]
  xAxis?: string
  title?: string
}

export function NexusDataChart({ chartData }: { chartData: ChartData }) {
  const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#ef4444']

  return (
    <div className="my-6 p-6 rounded-2xl bg-black/40 border border-white/10 shadow-2xl animate-in zoom-in duration-500">
      {chartData.title && (
        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6 text-center">
          {chartData.title}
        </h4>
      )}
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartData.type === 'bar' ? (
            <BarChart data={chartData.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey={chartData.xAxis || 'name'} 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(0,0,0,0.9)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  fontSize: '11px'
                }} 
              />
              {chartData.keys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : chartData.type === 'pie' ? (
            <PieChart>
              <Pie
                data={chartData.data}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey={chartData.keys[0]}
                nameKey={chartData.xAxis || 'name'}
              >
                {chartData.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="rgba(0,0,0,0.5)" />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(0,0,0,0.9)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  fontSize: '11px'
                }} 
              />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
            </PieChart>
          ) : (
            <AreaChart data={chartData.data}>
              <defs>
                {chartData.keys.map((key, i) => (
                  <linearGradient key={`grad-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey={chartData.xAxis || 'name'} 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(0,0,0,0.9)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  fontSize: '11px'
                }} 
              />
              {chartData.keys.map((key, i) => (
                <Area 
                  key={key}
                  type="monotone" 
                  dataKey={key} 
                  stroke={colors[i % colors.length]} 
                  fillOpacity={1} 
                  fill={`url(#color-${key})`} 
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
