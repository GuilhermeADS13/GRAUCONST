// ============================================================
// usePushNotifications — Hook para gerenciar PWA Push
// Alertas: temperatura, wifi fraco, bateria — sem umidade
// Limites: temp [-15°C, -5°C] | wifi < -85dBm | bat < 20%
// ============================================================

import { useState, useEffect } from 'react'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Limites de alerta (espelham as env vars do backend)
const TEMP_MIN  = -15
const TEMP_MAX  = -5
const RSSI_MIN  = -85
const BAT_MIN   = 20
const BAT_CRIT  = 5

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [permissao, setPermissao]   = useState(Notification.permission)
  const [suportado, setSuportado]   = useState(false)
  const [inscrito, setInscrito]     = useState(false)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSuportado(ok)
    if (ok) {
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => setInscrito(!!sub))
      )
    }
  }, [])

  // Registra o service worker
  useEffect(() => {
    if (!suportado) return
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('[GrauConst] SW registrado'))
      .catch((e) => console.error('[GrauConst] SW error:', e))
  }, [suportado])

  async function solicitarPermissao() {
    if (!suportado) return false
    setCarregando(true)
    try {
      const resultado = await Notification.requestPermission()
      setPermissao(resultado)
      if (resultado !== 'granted') { setCarregando(false); return false }

      if (VAPID_PUBLIC_KEY) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        console.log('[GrauConst] Push subscription:', JSON.stringify(sub))
        setInscrito(true)
      }

      setCarregando(false)
      return true
    } catch (e) {
      console.error('[GrauConst] Push error:', e)
      setCarregando(false)
      return false
    }
  }

  async function cancelarInscricao() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) { await sub.unsubscribe(); setInscrito(false); setPermissao('default') }
    } catch (e) {
      console.error('[GrauConst] Unsubscribe error:', e)
    }
  }

  // ── Notificação local (disparada pelo Realtime do dashboard) ──
  async function notificarLocal(title, body, tipo = 'info') {
    if (permissao !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    reg.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: tipo,
      renotify: true,
      requireInteraction: ['temp_baixa', 'temp_alta', 'watchdog', 'bateria_critica'].includes(tipo),
      data: { tipo, url: '/' },
    })
  }

  // ── Verificar leitura recebida e notificar se necessário ──
  async function verificarENotificar(leitura) {
    if (permissao !== 'granted') return

    const temp = leitura.temperatura != null ? parseFloat(leitura.temperatura) : null
    const bat  = leitura.bateria_pct  != null ? parseInt(leitura.bateria_pct)  : null
    const rssi = leitura.rssi         != null ? parseInt(leitura.rssi)          : null

    if (temp !== null) {
      if (temp < TEMP_MIN)
        await notificarLocal(`🥶 Temperatura Crítica`, `${temp.toFixed(1)}°C — abaixo de ${TEMP_MIN}°C`, 'temp_baixa')
      else if (temp > TEMP_MAX)
        await notificarLocal(`🔥 Temperatura Alta`, `${temp.toFixed(1)}°C — acima de ${TEMP_MAX}°C`, 'temp_alta')
    }

    if (bat !== null) {
      if (bat <= BAT_CRIT)
        await notificarLocal(`🪫 Bateria Crítica!`, `${bat}% — sensor pode desligar!`, 'bateria_critica')
      else if (bat <= BAT_MIN)
        await notificarLocal(`🔋 Bateria Baixa`, `${bat}% — recarregue em breve`, 'bateria_fraca')
    }

    if (rssi !== null && rssi < RSSI_MIN)
      await notificarLocal(`📶 WiFi Fraco`, `RSSI: ${rssi} dBm`, 'wifi_fraco')
  }

  return {
    suportado,
    permissao,
    inscrito,
    carregando,
    solicitarPermissao,
    cancelarInscricao,
    notificarLocal,
    verificarENotificar,   // ← usar no handler do Realtime no App.jsx
  }
}
