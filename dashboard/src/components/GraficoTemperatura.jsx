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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 shadow-2xl text-sm">
      <p className="text-slate-400 mb-1 font-medium">{label}</p>
      <p className="text-blue-300 font-black text-lg">🌡️ {payload[0].value}°C</p>
    </div>
  )
}

export function GraficoTemperatura({ dados, loading, formatoEixo = 'hora' }) {
  const { t } = useTranslation()

  const { chartData, min, max, minTemp, maxTemp, media } = useMemo(() => {
    const cd = dados.map((d) => ({
      rotulo: formatRotuloEixo(d.created_at, formatoEixo),
      temperatura: parseFloat(d.temperatura),
    }))
    if (!cd.length) {
      return { chartData: cd, min: 0, max: 40, minTemp: null, maxTemp: null, media: null }
    }
    const temps = cd.map((d) => d.temperatura)
    const minT = Math.min(...temps)
    const maxT = Math.max(...temps)
    const med = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
    return {
      chartData: cd,
      min: Math.floor(minT) - 2,
      max: Math.ceil(maxT) + 2,
      minTemp: minT,
      maxTemp: maxT,
      media: med,
    }
  }, [dados, formatoEixo])

  if (loading)
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">{t('chart.loading')}</span>
        </div>
      </div>
    )

  if (!chartData.length)
    return (
      <div className="h-64 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('chart.empty')}</p>
      </div>
    )

  return (
    <div>
      {media && (
        <div className="flex gap-6 mb-4 text-sm">
          <span className="text-slate-400">
            {t('chart.avg')}: <span className="text-blue-300 font-bold">{media}°C</span>
          </span>
          <span className="text-slate-400">
            {t('chart.min')}:{' '}
            <span className="text-teal-300 font-bold">{minTemp.toFixed(1)}°C</span>
          </span>
          <span className="text-slate-400">
            {t('chart.max')}: <span className="text-red-300 font-bold">{maxTemp.toFixed(1)}°C</span>
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="rotulo"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1e293b' }}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}°`}
          />
          <Tooltip content={<CustomTooltip />} />
          {media && (
            <ReferenceLine
              y={parseFloat(media)}
              stroke="#64748b"
              strokeDasharray="4 4"
              label={{
                value: t('chart.avg').toLowerCase(),
                position: 'insideTopRight',
                fill: '#64748b',
                fontSize: 10,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="temperatura"
            stroke="#3b82f6"
            strokeWidth={3}
            fill="url(#gradTemp)"
            dot={false}
            activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
