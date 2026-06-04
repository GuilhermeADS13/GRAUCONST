import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'

function formatRotuloEixo(iso, formato) {
  const d = new Date(iso)
  if (formato === 'data') {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Tooltip customizado ──────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 shadow-2xl text-sm min-w-[150px] space-y-2">
      <p className="text-slate-500 text-xs font-medium mb-1">{label}</p>
      
      {payload.map((item, idx) => (
        <div key={idx} className="flex flex-col">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            {item.name}
          </p>
          <div className="flex items-end gap-1">
            <span className="text-xl font-black" style={{ color: item.color }}>
              {item.value?.toFixed(1)}
            </span>
            <span className="font-bold mb-0.5" style={{ color: item.color }}>°C</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Skeleton de loading ──────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* mini-stats */}
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 flex-1 bg-slate-800/70 rounded-xl" />
        ))}
      </div>
      {/* gráfico */}
      <div className="h-64 bg-slate-800/40 rounded-xl flex items-end px-4 pb-4 gap-1">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-700/50 rounded-t-sm"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────
export function GraficoTemperatura({ dados, loading, formatoEixo = 'hora' }) {
  const { t } = useTranslation()

  const { chartData, min, max, minTemp, maxTemp, media } = useMemo(() => {
    const cd = dados.map((d) => ({
      rotulo: formatRotuloEixo(d.created_at, formatoEixo),
      temperatura: d.temperatura != null ? parseFloat(d.temperatura) : null,
      inkbird: d.inkbird_temp != null ? parseFloat(d.inkbird_temp) : null,
    }))
    
    if (!cd.length) {
      return { chartData: cd, min: 0, max: 40, minTemp: null, maxTemp: null, media: null }
    }
    
    const allTemps = cd.flatMap(d => [d.temperatura, d.inkbird].filter(v => v !== null))
    if (!allTemps.length) {
        return { chartData: cd, min: 0, max: 40, minTemp: null, maxTemp: null, media: null }
    }

    const minT = Math.min(...allTemps)
    const maxT = Math.max(...allTemps)
    const med = (allTemps.reduce((a, b) => a + b, 0) / allTemps.length).toFixed(1)
    
    return {
      chartData: cd,
      min: Math.floor(minT) - 3,
      max: Math.ceil(maxT) + 3,
      minTemp: minT,
      maxTemp: maxT,
      media: med,
    }
  }, [dados, formatoEixo])

  if (loading) return <Skeleton />

  if (!chartData.length)
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2">
        <span className="text-3xl opacity-30">📈</span>
        <p className="text-slate-500 text-sm">{t('chart.empty')}</p>
      </div>
    )

  return (
    <div className="space-y-4">
      {/* ── Mini-stats ─────────────────────────────────── */}
      {media && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2.5 text-center">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{t('chart.avg')}</p>
            <p className="text-blue-300 font-black text-lg leading-none">{media}°C</p>
          </div>
          <div className="bg-slate-800/60 border border-teal-700/30 rounded-xl px-3 py-2.5 text-center">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{t('chart.min')}</p>
            <p className="text-teal-300 font-black text-lg leading-none">{minTemp.toFixed(1)}°C</p>
          </div>
          <div className="bg-slate-800/60 border border-red-700/30 rounded-xl px-3 py-2.5 text-center">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{t('chart.max')}</p>
            <p className="text-red-300 font-black text-lg leading-none">{maxTemp.toFixed(1)}°C</p>
          </div>
        </div>
      )}

      {/* ── Gráfico ────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="60%" stopColor="#3b82f6" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradInk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#f59e0b" stopOpacity={0.45} />
              <stop offset="60%" stopColor="#f59e0b" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="gradStrokeInk" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 6"
            stroke="#1e293b"
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Inter' }}
            tickLine={false}
            axisLine={{ stroke: '#1e293b' }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Inter' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}°`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />

          {/* Linha de média */}
          {media && (
            <ReferenceLine
              y={parseFloat(media)}
              stroke="#475569"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: `⌀ ${media}°`,
                position: 'insideTopRight',
                fill: '#64748b',
                fontSize: 10,
                fontFamily: 'Inter',
              }}
            />
          )}

          <Area
            type="monotone"
            name={t('sensor.temperature')}
            dataKey="temperatura"
            stroke="url(#gradStroke)"
            strokeWidth={2.5}
            fill="url(#gradTemp)"
            dot={false}
            activeDot={{ r: 5, fill: '#3b82f6', stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls
          />
          
          <Area
            type="monotone"
            name={t('inkbird.temperature')}
            dataKey="inkbird"
            stroke="url(#gradStrokeInk)"
            strokeWidth={2.5}
            fill="url(#gradInk)"
            dot={false}
            activeDot={{ r: 5, fill: '#f59e0b', stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
