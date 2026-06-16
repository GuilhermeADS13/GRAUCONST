// ============================================================
// telegram-alert — Envia alertas para o Telegram.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_CHAT_IDS  = (Deno.env.get('TELEGRAM_CHAT_ID') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

const TEMP_MIN   = parseFloat(Deno.env.get('ALERTA_TEMP_MIN')   ?? '-20')
const TEMP_MAX   = parseFloat(Deno.env.get('ALERTA_TEMP_MAX')   ?? '-5')
const RSSI_MIN   = parseInt(Deno.env.get('ALERTA_RSSI_MIN')     ?? '-85')
const BAT_MIN    = parseInt(Deno.env.get('ALERTA_BAT_MIN')      ?? '20')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sendTelegram(texto: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  await Promise.all(
    TELEGRAM_CHAT_IDS.map(async (chat_id) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text: texto }),
      })
      const body = await res.json()
      if (!res.ok) console.error(`Telegram API error (${chat_id}):`, JSON.stringify(body))
      else console.log(`Telegram OK (${chat_id}): message_id=${body.result?.message_id}`)
    }),
  )
}

const SENSOR_NOMES: Record<string, string> = {
  'ESP32-1CC3ABC28A30': 'Arosa-Loja',
}
function nomeSensor(sensor_id: string): string {
  return SENSOR_NOMES[sensor_id] ?? sensor_id
}

function buildMensagem(tipo: string, sensor_id: string, valor?: number, rssi?: number, bateria?: number): string {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const sensor = nomeSensor(sensor_id)

  switch (tipo) {
    case 'temp_baixa':
      return `🥶 ALERTA — Temperatura Crítica Baixa\n\nSensor: ${sensor}\nTemperatura: ${valor?.toFixed(1)}°C\nLimite mínimo: ${TEMP_MIN}°C\n\n🕐 ${agora}`
    case 'temp_alta':
      return `🔥 ALERTA — Temperatura Crítica Alta\n\nSensor: ${sensor}\nTemperatura: ${valor?.toFixed(1)}°C\nLimite máximo: ${TEMP_MAX}°C\n\n🕐 ${agora}`
    case 'temp_ok':
      return `✅ Temperatura Normalizada\n\nSensor: ${sensor}\nTemperatura: ${valor?.toFixed(1)}°C\nRange: [${TEMP_MIN}°C, ${TEMP_MAX}°C]\n\n🕐 ${agora}`

    case 'wifi_fraco':
      return `📶 ALERTA — Sinal WiFi Fraco\n\nSensor: ${sensor}\nRSSI: ${rssi} dBm\nLimite: ${RSSI_MIN} dBm\n⚠️ Risco de perda de dados.\n\n🕐 ${agora}`
    case 'wifi_ok':
      return `✅ Sinal WiFi Normalizado\n\nSensor: ${sensor}\nRSSI: ${rssi} dBm\n\n🕐 ${agora}`

    case 'bateria_fraca':
      return `🔋 ALERTA — Bateria Inkbird Baixa\n\nSensor: ${sensor}\nBateria Inkbird: ${bateria}%\nLimite: ${BAT_MIN}%\n⚠️ Troque a pilha do sensor em breve.\n\n🕐 ${agora}`
    case 'bateria_critica':
      return `🪫 ALERTA CRÍTICO — Bateria Inkbird Quase Vazia\n\nSensor: ${sensor}\nBateria Inkbird: ${bateria}%\n⛔ Sensor pode perder sinal a qualquer momento!\n\n🕐 ${agora}`
    case 'bateria_ok':
      return `✅ Bateria Inkbird Normalizada\n\nSensor: ${sensor}\nBateria Inkbird: ${bateria}%\n\n🕐 ${agora}`

    case 'esp32_bat_fraca':
      return `🔋 ALERTA — Bateria ESP32 Baixa\n\nSensor: ${sensor}\nBateria pack 2S: ${bateria}%\nLimite: ${BAT_MIN}%\n⚠️ Recarregue as pilhas do ESP32 em breve.\n\n🕐 ${agora}`
    case 'esp32_bat_critica':
      return `🪫 ALERTA CRÍTICO — Bateria ESP32 Quase Vazia\n\nSensor: ${sensor}\nBateria pack 2S: ${bateria}%\n⛔ ESP32 pode desligar a qualquer momento!\n\n🕐 ${agora}`
    case 'esp32_bat_ok':
      return `✅ Bateria ESP32 Normalizada\n\nSensor: ${sensor}\nBateria pack 2S: ${bateria}%\n\n🕐 ${agora}`

    case 'watchdog':
      return `⚠️ ALERTA — ESP32 Sem Sinal\n\nSensor: ${sensor}\nNenhuma leitura há mais de 18 minutos.\n⛔ Possível queda de energia, internet ou WiFi.\n\n🕐 ${agora}`
    case 'watchdog_ok':
      return `✅ ESP32 Voltou Online\n\nSensor: ${sensor}\nSinal restabelecido com sucesso.\n\n🕐 ${agora}`

    default:
      return `ℹ️ GrauConst — ${tipo}\nSensor: ${sensor}\n🕐 ${agora}`
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
    console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados')
    return jsonResponse({ error: 'Telegram not configured' }, 500)
  }
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }

  const { tipo, sensor_id, valor, rssi, bateria } = body as {
    tipo: string; sensor_id: string; valor?: number; rssi?: number; bateria?: number
  }
  if (!tipo || !sensor_id) return jsonResponse({ error: 'tipo e sensor_id obrigatórios' }, 400)

  try {
    const texto = buildMensagem(tipo, sensor_id, valor, rssi, bateria)
    console.log(`[telegram-alert] tipo=${tipo} sensor=${sensor_id} msg_preview="${texto.slice(0,60)}..."`)
    await sendTelegram(texto)
    return jsonResponse({ ok: true, tipo, sensor_id })
  } catch (e) {
    console.error('Erro ao enviar Telegram:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})
