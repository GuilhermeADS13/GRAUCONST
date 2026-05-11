export function StatCard({ icon, label, value, unit, status, cor }) {
  const cores = {
    blue:  { bg: 'bg-blue-500/10',  border: 'border-blue-500/30',  text: 'text-blue-400',  val: 'text-blue-300'  },
    teal:  { bg: 'bg-teal-500/10',  border: 'border-teal-500/30',  text: 'text-teal-400',  val: 'text-teal-300'  },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', val: 'text-amber-300' },
    red:   { bg: 'bg-red-500/10',   border: 'border-red-500/30',   text: 'text-red-400',   val: 'text-red-300'   },
  }
  const c = cores[cor] || cores.blue

  return (
    <div className={`rounded-2xl border ${c.bg} ${c.border} p-6 flex flex-col gap-3 transition-all duration-300 hover:scale-[1.02]`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${c.text} uppercase tracking-widest`}>{label}</span>
        <span className="text-3xl">{icon}</span>
      </div>
      {value !== null && value !== undefined ? (
        <div className="flex items-end gap-1 mt-1">
          <span className={`text-5xl font-black ${c.val}`}>{value}</span>
          <span className={`text-xl font-semibold ${c.text} mb-1`}>{unit}</span>
        </div>
      ) : (
        <div className="h-12 w-32 bg-slate-700/50 rounded-xl animate-pulse mt-1" />
      )}
      {status && (
        <span className={`text-xs ${c.text} font-semibold opacity-80`}>{status}</span>
      )}
    </div>
  )
}
