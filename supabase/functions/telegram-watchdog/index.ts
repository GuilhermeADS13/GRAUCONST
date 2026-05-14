// ============================================================
//  telegram-watchdog — Monitora sensor e envia alertas Telegram.
//
//  Chamado via pg_cron a cada 5 minutos (sem autenticação JWT).
//  Verifica 3 condições, envia alerta apenas na transição:
//    1. Sensor offline   → sem leituras há > 15 min
//    2. Bateria baixa    → bateria_pct < 30 %
//    3. WiFi muito fraco → rssi < -85 dBm
//
//  Secrets necessários (Supabase → Edge Functions → Secrets):
//    TELEGRAM_BOT_TOKEN  → token do @BotFather
//    TELEGRAM_CHAT_ID    → chat_id do seu Telegram pessoal
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const OFFLINE_THRESHOLD_MS = 15 * 60 * 1000 // 15 min sem leituras = offline
const BATTERY_LOW_PCT = 30                    // < 30 % = bateria baixa
const WIFI_WEAK_RSSI = -85                    // < -85 dBm = WiFi muito fraco

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sendTelegram(token: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!r.ok) console.error('Telegram API error:', await r.text())
}

Deno.serve(async (_req) => {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  // Suporta múltiplos destinatários: "111111,222222,333333"
  const chatIds  = (Deno.env.get('TELEGRAM_CHAT_ID') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  if (!botToken || chatIds.length === 0) {
    console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados')
    return json({ error: 'Telegram not configured' }, 500)
  }

  try {
    // ── Última leitura ────────────────────────────────────────
    const { data: last } = await supabase
      .from('sensor_leituras')
      .select('sensor_id, bateria_pct, rssi, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const sensorId = last?.sensor_id ?? 'GRAUCONST'
    const gapMs    = last ? Date.now() - new Date(last.created_at).getTime() : Infinity

    const nowOffline      = gapMs > OFFLINE_THRESHOLD_MS
    const nowBateriaBaixa = last?.bateria_pct != null && last.bateria_pct < BATTERY_LOW_PCT
    const nowWifiFraco    = last?.rssi        != null && last.rssi        < WIFI_WEAK_RSSI

    // ── Estado anterior ───────────────────────────────────────
    const { data: prev } = await supabase
      .from('sensor_alertas')
      .select('em_offline, em_bateria_baixa, em_wifi_fraco')
      .eq('sensor_id', sensorId)
      .single()

    const wasOffline      = prev?.em_offline       ?? false
    const wasBateriaBaixa = prev?.em_bateria_baixa ?? false
    const wasWifiFraco    = prev?.em_wifi_fraco    ?? false

    // ── Gerar mensagens (só na transição) ─────────────────────
    const msgs: string[] = []

    if (nowOffline && !wasOffline) {
      msgs.push(
        '🔴 GrauConst — Sensor OFFLINE\n\n' +
        'Sem leituras há mais de 15 minutos.\n' +
        'Verifique se caiu energia ou se o WiFi do ESP32 está funcionando.'
      )
    } else if (!nowOffline && wasOffline) {
      msgs.push('✅ GrauConst — Sensor ONLINE\n\nLeituras voltaram a chegar. Tudo normalizado.')
    }

    if (nowBateriaBaixa && !wasBateriaBaixa) {
      msgs.push(
        `🪫 GrauConst — Bateria BAIXA\n\n` +
        `Bateria em ${last!.bateria_pct}%. Carregue o ESP32 em breve.`
      )
    } else if (!nowBateriaBaixa && wasBateriaBaixa && last?.bateria_pct != null) {
      msgs.push(`🔋 GrauConst — Bateria OK\n\nBateria em ${last.bateria_pct}%. Normalizado.`)
    }

    if (nowWifiFraco && !wasWifiFraco) {
      msgs.push(
        `📵 GrauConst — WiFi MUITO FRACO\n\n` +
        `Sinal RSSI: ${last!.rssi} dBm. Aproxime o ESP32 do roteador.\n` +
        `Abaixo de -85 dBm há risco de perder conexão.`
      )
    } else if (!nowWifiFraco && wasWifiFraco && last?.rssi != null) {
      msgs.push(`📶 GrauConst — WiFi normalizado\n\nRSSI: ${last.rssi} dBm.`)
    }

    // ── Enviar mensagens para todos os destinatários ──────────
    for (const m of msgs) {
      for (const id of chatIds) {
        await sendTelegram(botToken, id, m)
      }
    }

    // ── Salvar estado atual ───────────────────────────────────
    await supabase.from('sensor_alertas').upsert(
      {
        sensor_id:        sensorId,
        em_offline:       nowOffline,
        em_bateria_baixa: nowBateriaBaixa,
        em_wifi_fraco:    nowWifiFraco,
        updated_at:       new Date().toISOString(),
      },
      { onConflict: 'sensor_id' }
    )

    return json({
      ok:           true,
      alerts_sent:  msgs.length,
      state:        { nowOffline, nowBateriaBaixa, nowWifiFraco },
    })
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
