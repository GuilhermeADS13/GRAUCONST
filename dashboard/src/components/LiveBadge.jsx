// ============================================================
//  LiveBadge.jsx — Indicador visual de status do Realtime.
//
//  Props:
//    realtime (boolean) → true quando o canal Supabase está SUBSCRIBED.
//
//  Visual:
//    - Bolinha verde pulsante + texto "Realtime ativo" quando conectado.
//    - Bolinha cinza + "Offline" quando desconectado.
//
//  O App.jsx atualiza essa prop pelo callback do `.subscribe(status)`.
// ============================================================

export function LiveBadge({ realtime }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center w-3 h-3">
        {/* Anel verde pulsante (animação Tailwind) só quando online */}
        {realtime && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        )}
        {/* Bolinha central: muda de cor conforme status */}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${realtime ? 'bg-green-500' : 'bg-slate-600'}`}
        />
      </div>
      <span className={`text-xs font-semibold ${realtime ? 'text-green-400' : 'text-slate-500'}`}>
        {realtime ? 'Realtime ativo' : 'Offline'}
      </span>
    </div>
  )
}
