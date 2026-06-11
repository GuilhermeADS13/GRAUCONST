// ============================================================
// telegram-alert — Envia alertas para o Telegram.
// Alertas: temp_baixa | temp_alta | wifi_fraco | bateria_fraca | watchdog | *_ok
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
// Suporta múltiplos destinatários separados por vírgula: "111,222,333"
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
        body: JSON.stringify({ chat_id, text: texto, parse_mode: 'HTML' }),
      })
      if (!res.ok) console.error(`Telegram API error (${chat_id}): ${await res.text()}`)
    }),
  )
}

// Nomes amigáveis por sensor_id — exibidos no Telegram no lugar do ID técnico.
// Para adicionar/renomear sensores, acrescente entradas aqui e faça redeploy.
const SENSOR_NOMES: Record<string, string> = {
  'ESP32-1CC3ABC28A30': 'Arosa-Loja',
}
function nomeSensor(sensor_id: string): string {
  return SENSOR_NOMES[sensor_id] ?? sensor_id
}

function buildMensagem(tipo: string, sensor_id: string, valor?: number, rssi?: number, bateria?: number): string {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const sensor = `<b>${nomeSensor(sensor_id)}</b>`
  switch (tipo) {
    case 'temp_baixa':
      return `🥶 <b>ALERTA — Temperatura Crítica Baixa</b>\n\nSensor: ${sensor}\nTemperatura: <b>${valor?.toFixed(1)}°C</b>\nLimite mínimo: ${TEMP_MIN}°C\n\n🕐 ${agora}`
    case 'temp_alta':
      return `🔥 <b>ALERTA — Temperatura Crítica Alta</b>\n\nSensor: ${sensor}\nTemperatura: <b>${valor?.toFixed(1)}°C</b>\nLimite máximo: ${TEMP_MAX}°C\n\n🕐 ${agora}`
    case 'wifi_fraco':
      return `📶 <b>ALERTA — Sinal WiFi Fraco</b>\n\nSensor: ${sensor}\nRSSI: <b>${rssi} dBm</b>\nLimite: ${RSSI_MIN} dBm\n⚠️ Risco de perda de dados.\n\n🕐 ${agora}`
    case 'bateria_fraca':
      return `🔋 <b>ALERTA — Bateria Baixa</b>\n\nSensor: ${sensor}\nBateria: <b>${bateria}%</b>\nLimite: ${BAT_MIN}%\n⚠️ Recarregue em breve.\n\n🕐 ${agora}`
    case 'bateria_critica':
      return `🪫 <b>ALERTA CRÍTICO — Bateria Quase Vazia</b>\n\nSensor: ${sensor}\nBateria: <b>${bateria}%</b>\n⛔ Sensor pode desligar a qualquer momento!\n\n🕐 ${agora}`
    case 'watchdog':
      return `⚠️ <b>ALERTA — ESP32 Sem Sinal</b>\n\nSensor: ${sensor}\nNenhuma leitura há mais de 15 minutos.\nVerifique alimentação e conexão WiFi.\n\n🕐 ${agora}`
    case 'watchdog_ok':
      return `✅ <b>ESP32 Voltou Online</b>\n\nSensor: ${sensor}\nSinal restabelecido com sucesso.\n\n🕐 ${agora}`
    case 'temp_ok':
      return `✅ <b>Temperatura Normalizada</b>\n\nSensor: ${sensor}\nTemperatura: <b>${valor?.toFixed(1)}°C</b>\nDentro do range [${TEMP_MIN}°C, ${TEMP_MAX}°C].\n\n🕐 ${agora}`
    case 'wifi_ok':
      return `✅ <b>Sinal WiFi Normalizado</b>\n\nSensor: ${sensor}\nRSSI: <b>${rssi} dBm</b>\nConexão de volta ao normal.\n\n🕐 ${agora}`
    case 'bateria_ok':
      return `✅ <b>Bateria Normalizada</b>\n\nSensor: ${sensor}\nBateria: <b>${bateria}%</b>\n\n🕐 ${agora}`
    default:
      return `ℹ️ <b>GrauConst</b> — ${tipo}\nSensor: ${sensor}\n🕐 ${agora}`
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
  const { tipo, sensor_id, valor, rssi, bateria } = body as { tipo: string; sensor_id: string; valor?: number; rssi?: number; bateria?: number }
  if (!tipo || !sensor_id) return jsonResponse({ error: 'tipo e sensor_id obrigatórios' }, 400)
  try {
    const texto = buildMensagem(tipo, sensor_id, valor, rssi, bateria)
    await sendTelegram(texto)
    return jsonResponse({ ok: true, tipo, sensor_id })
  } catch (e) {
    console.error('Erro ao enviar Telegram:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})
