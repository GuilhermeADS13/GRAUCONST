import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 shadow-2xl text-sm">
      <p className="text-slate-400 mb-1 font-medium">{label}</p>
      <p className="text-blue-300 font-black text-lg">
        🌡️ {payload[0].value}°C
      </p>
    </div>
  )
}

export function GraficoTemperatura({ dados, loading }) {
  const chartData = dados.map(d => ({
    hora:        formatHora(d.created_at),
    temperatura: parseFloat(d.temperatura),
  }))

  const temps = chartData.map(d => d.temperatura)
  const min   = temps.length ? Math.floor(Math.min(...temps)) - 2 : 0
  const max   = temps.length ? Math.ceil(Math.max(...temps))  + 2 : 40
  const media = temps.length ? (temps.reduce((a,b) => a+b, 0) / temps.length).toFixed(1) : null

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">Carregando dados...</span>
      </div>
    </div>
  )

  if (!chartData.length) return (
    <div className="h-64 flex items-center justify-center">
      <p className="text-slate-500 text-sm">Nenhum registro nas últimas 24h</p>
    </div>
  )

  return (
    <div>
      {media && (
        <div className="flex gap-6 mb-4 text-sm">
          <span className="text-slate-400">Média: <span className="text-blue-300 font-bold">{media}°C</span></span>
          <span className="text-slate-400">Mín: <span className="text-teal-300 font-bold">{Math.min(...temps).toFixed(1)}°C</span></span>
          <span className="text-slate-400">Máx: <span className="text-red-300 font-bold">{Math.max(...temps).toFixed(1)}°C</span></span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="hora"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1e293b' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min, max]}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}°`}
          />
          <Tooltip content={<CustomTooltip />} />
          {media && (
            <ReferenceLine
              y={parseFloat(media)}
              stroke="#64748b"
              strokeDasharray="4 4"
              label={{ value: `média`, position: 'insideTopRight', fill: '#64748b', fontSize: 10 }}
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
