// ============================================================
// telegram-alert — Envia alertas para o Telegram.
// Alertas: temp_baixa | temp_alta | wifi_fraco | bateria_fraca | watchdog | *_ok
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID')!

const TEMP_MIN   = parseFloat(Deno.env.get('ALERTA_TEMP_MIN')   ?? '-15')
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML',
    }),
  })
  if (!res.ok) throw new Error(`Telegram API error: ${await res.text()}`)
  return res.json()
}

function buildMensagem(
  tipo: string,
  sensor_id: string,
  valor?: number,
  rssi?: number,
  bateria?: number,
): string {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const sensor = `<b>${sensor_id}</b>`

  switch (tipo) {
    case 'temp_baixa':
      return (
        `🥶 <b>ALERTA — Temperatura Crítica Baixa</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Temperatura: <b>${valor?.toFixed(1)}°C</b>\n` +
        `Limite mínimo: ${TEMP_MIN}°C\n\n` +
        `🕐 ${agora}`
      )

    case 'temp_alta':
      return (
        `🔥 <b>ALERTA — Temperatura Crítica Alta</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Temperatura: <b>${valor?.toFixed(1)}°C</b>\n` +
        `Limite máximo: ${TEMP_MAX}°C\n\n` +
        `🕐 ${agora}`
      )

    case 'wifi_fraco':
      return (
        `📶 <b>ALERTA — Sinal WiFi Fraco</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `RSSI: <b>${rssi} dBm</b>\n` +
        `Limite: ${RSSI_MIN} dBm\n` +
        `⚠️ Risco de perda de dados.\n\n` +
        `🕐 ${agora}`
      )

    case 'bateria_fraca':
      return (
        `🔋 <b>ALERTA — Bateria Baixa</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Bateria: <b>${bateria}%</b>\n` +
        `Limite: ${BAT_MIN}%\n` +
        `⚠️ Recarregue em breve.\n\n` +
        `🕐 ${agora}`
      )

    case 'bateria_critica':
      return (
        `🪫 <b>ALERTA CRÍTICO — Bateria Quase Vazia</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Bateria: <b>${bateria}%</b>\n` +
        `⛔ Sensor pode desligar a qualquer momento!\n\n` +
        `🕐 ${agora}`
      )

    case 'watchdog':
      return (
        `⚠️ <b>ALERTA — ESP32 Sem Sinal</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Nenhuma leitura há mais de 15 minutos.\n` +
        `Verifique alimentação e conexão WiFi.\n\n` +
        `🕐 ${agora}`
      )

    case 'watchdog_ok':
      return (
        `✅ <b>ESP32 Voltou Online</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Sinal restabelecido com sucesso.\n\n` +
        `🕐 ${agora}`
      )

    case 'temp_ok':
      return (
        `✅ <b>Temperatura Normalizada</b>\n\n` +
        `Sensor: ${sensor}\n` +
        `Temperatura: <b>${valor?.toFixed(1)}°C</b>\n` +
        `Dentro do range [-15°C, -5°C].\n\n` +
        `🕐 ${agora}`
      )

    default:
      return `ℹ️ <b>GrauConst</b> — ${tipo}\nSensor: ${sensor}\n🕐 ${agora}`
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados')
    return jsonResponse({ error: 'Telegram not configured' }, 500)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { tipo, sensor_id, valor, rssi, bateria, mensagem } = body as {
    tipo: string
    sensor_id: string
    valor?: number
    rssi?: number
    bateria?: number
    mensagem?: string
  }

  if (!tipo || !sensor_id) return jsonResponse({ error: 'tipo e sensor_id obrigatórios' }, 400)

  try {
    const texto = buildMensagem(tipo, sensor_id, valor, rssi, bateria) ?? mensagem ?? ''
    await sendTelegram(texto)
    return jsonResponse({ ok: true, tipo, sensor_id })
  } catch (e) {
    console.error('Erro ao enviar Telegram:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})
