// ============================================================
// BotaoNotificacao — Botão PWA de ativar/desativar notificações
// ============================================================

import { usePushNotifications } from '../hooks/usePushNotifications'

export function BotaoNotificacao() {
  const { suportado, permissao, inscrito, carregando, solicitarPermissao, cancelarInscricao } =
    usePushNotifications()

  if (!suportado) return null

  if (permissao === 'denied') {
    return (
      <span
        title="Notificações bloqueadas no navegador. Habilite nas configurações do site."
        className="text-xs text-red-400 font-bold bg-slate-800 px-2.5 py-1 rounded-lg cursor-help"
      >
        🔕 Bloqueado
      </span>
    )
  }

  if (permissao === 'granted' && inscrito) {
    return (
      <button
        onClick={cancelarInscricao}
        title="Desativar notificações push"
        className="text-xs font-bold text-green-400 hover:text-red-400 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
      >
        🔔 Ativo
      </button>
    )
  }

  return (
    <button
      onClick={solicitarPermissao}
      disabled={carregando}
      title="Ativar notificações de alerta"
      className="text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
    >
      {carregando ? '⏳' : '🔔'} {carregando ? 'Ativando...' : 'Notificações'}
    </button>
  )
}
