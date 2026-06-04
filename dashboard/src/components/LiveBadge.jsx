import { useTranslation } from 'react-i18next'

export function LiveBadge({ realtime }) {
  const { t } = useTranslation()

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all duration-500 ${
        realtime
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-slate-800/80 border-slate-700/50 text-slate-500'
      }`}
    >
      {/* Dot com ping */}
      <div className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
        {realtime && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            realtime ? 'bg-green-400' : 'bg-slate-600'
          }`}
        />
      </div>

      {/* Label */}
      <span className="tracking-wide">{realtime ? t('badge.active') : t('badge.offline')}</span>
    </div>
  )
}
