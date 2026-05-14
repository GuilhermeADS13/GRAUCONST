import { useTranslation } from 'react-i18next'

export function LiveBadge({ realtime }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center w-3 h-3">
        {realtime && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${realtime ? 'bg-green-500' : 'bg-slate-600'}`}
        />
      </div>
      <span className={`text-xs font-semibold ${realtime ? 'text-green-400' : 'text-slate-500'}`}>
        {realtime ? t('badge.active') : t('badge.offline')}
      </span>
    </div>
  )
}
