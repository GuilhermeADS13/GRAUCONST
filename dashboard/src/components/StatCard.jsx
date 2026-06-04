// ============================================================
//  StatCard.jsx — Card de leitura com visual aprimorado.
// ============================================================

export function StatCard({ icon, label, value, unit, status, cor }) {
  const cores = {
    blue: {
      bg: 'bg-blue-500/8',
      border: 'border-blue-500/25',
      text: 'text-blue-400',
      val: 'text-blue-200',
      icon: 'bg-blue-500/15',
      glow: 'shadow-blue-500/10',
    },
    teal: {
      bg: 'bg-teal-500/8',
      border: 'border-teal-500/25',
      text: 'text-teal-400',
      val: 'text-teal-200',
      icon: 'bg-teal-500/15',
      glow: 'shadow-teal-500/10',
    },
    amber: {
      bg: 'bg-amber-500/8',
      border: 'border-amber-500/25',
      text: 'text-amber-400',
      val: 'text-amber-200',
      icon: 'bg-amber-500/15',
      glow: 'shadow-amber-500/10',
    },
    red: {
      bg: 'bg-red-500/8',
      border: 'border-red-500/25',
      text: 'text-red-400',
      val: 'text-red-200',
      icon: 'bg-red-500/15',
      glow: 'shadow-red-500/10',
    },
  }
  const c = cores[cor] || cores.blue

  return (
    <div
      className={`rounded-2xl border ${c.bg} ${c.border} p-5 flex flex-col gap-3
        shadow-lg ${c.glow} transition-all duration-300 hover:scale-[1.02] hover:shadow-xl`}
    >
      {/* Topo: label + ícone com fundo */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${c.text} uppercase tracking-widest`}>{label}</span>
        <span
          className={`text-2xl flex items-center justify-center w-10 h-10 rounded-xl ${c.icon}`}
        >
          {icon}
        </span>
      </div>

      {/* Valor numérico ou skeleton */}
      {value !== null && value !== undefined ? (
        <div className="flex items-end gap-1">
          <span className={`text-4xl font-black ${c.val} leading-none`}>{value}</span>
          <span className={`text-lg font-semibold ${c.text} mb-0.5`}>{unit}</span>
        </div>
      ) : (
        <div className="h-10 w-28 bg-slate-700/50 rounded-xl animate-pulse" />
      )}

      {/* Status */}
      {status && (
        <div className={`text-xs ${c.text} font-semibold opacity-90 flex items-center gap-1`}>
          {status}
        </div>
      )}
    </div>
  )
}
