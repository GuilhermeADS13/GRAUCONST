// ============================================================
// sensor-ingest — Gateway de inserção de leituras.
//
// Endpoint:
//   POST /functions/v1/sensor-ingest
//   Header: X-Device-Token: <token>
//   Body: { sensor_id, temperatura, umidade?, rssi?, bateria_pct? }
//
// Alertas disparados:
//   - temperatura < TEMP_MIN  → temp_baixa
//   - temperatura > TEMP_MAX  → temp_alta
//   - rssi < RSSI_MIN         → wifi_fraco
//   - bateria_pct < BAT_MIN   → bateria_fraca
//   - bateria_pct < 5         → bateria_critica
//   (sem alerta de umidade)
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEVICE_TOKEN = Deno.env.get('DEVICE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Limites de alerta
const TEMP_MIN  = parseFloat(Deno.env.get('ALERTA_TEMP_MIN')  ?? '-15')
const TEMP_MAX  = parseFloat(Deno.env.get('ALERTA_TEMP_MAX')  ?? '-5')
const RSSI_MIN  = parseInt(Deno.env.get('ALERTA_RSSI_MIN')    ?? '-85')
const BAT_MIN   = parseInt(Deno.env.get('ALERTA_BAT_MIN')     ?? '20')
const BAT_CRIT  = 5   // % crítico — hardcoded, nunca deve estar sem bateria

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Cooldown: verifica se já alertou nos últimos N minutos ──
async function jaAlertado(sensor_id: string, tipo: string, minutos = 30): Promise<boolean> {
  const { data } = await supabase
    .from('alerta_cooldown')
    .select('id')
    .eq('sensor_id', sensor_id)
    .eq('tipo', tipo)
    .gte('created_at', new Date(Date.now() - minutos * 60 * 1000).toISOString())
    .maybeSingle()
  return !!data
}

async function registrarCooldown(sensor_id: string, tipo: string) {
  await supabase.from('alerta_cooldown').insert({ sensor_id, tipo })
}

// ── Dispara alerta via Edge Function telegram-alert ──────────
async function dispararAlerta(payload: {
  tipo: string
  sensor_id: string
  valor?: number
  rssi?: number
  bateria?: number
}) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('Erro ao disparar alerta:', e)
  }
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  if (!DEVICE_TOKEN) {
    console.error('DEVICE_TOKEN não configurado')
    return jsonResponse({ error: 'Server not configured' }, 500)
  }

  // 1. Autenticação
  const token = req.headers.get('x-device-token')
  if (!token || token !== DEVICE_TOKEN)
    return jsonResponse({ error: 'Invalid or missing X-Device-Token' }, 401)

  // 2. Parse JSON
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { sensor_id, temperatura, umidade, rssi, bateria_pct, inkbird_temp, inkbird_hum, inkbird_bat } = body

  // 3. Validação
  if (typeof sensor_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(sensor_id))
    return jsonResponse({ error: 'Invalid sensor_id' }, 400)
  
  // A temperatura do DHT22 é obrigatória no schema original, mas agora permitimos que o dado venha só do Inkbird se o DHT falhar
  if (temperatura != null && (!isFiniteNumber(temperatura) || temperatura < -40 || temperatura > 80))
    return jsonResponse({ error: 'Invalid temperatura (-40..80)' }, 400)
  
  if (umidade != null && (!isFiniteNumber(umidade) || umidade < 0 || umidade > 100))
    return jsonResponse({ error: 'Invalid umidade (0..100)' }, 400)
  if (rssi != null && (!Number.isInteger(rssi) || (rssi as number) < -120 || (rssi as number) > 0))
    return jsonResponse({ error: 'Invalid rssi (-120..0)' }, 400)
  if (
    bateria_pct != null &&
    (!Number.isInteger(bateria_pct) || (bateria_pct as number) < 0 || (bateria_pct as number) > 100)
  )
    return jsonResponse({ error: 'Invalid bateria_pct (0..100)' }, 400)

  // Validação Inkbird
  if (inkbird_temp != null && !isFiniteNumber(inkbird_temp))
    return jsonResponse({ error: 'Invalid inkbird_temp' }, 400)
  if (inkbird_hum != null && !isFiniteNumber(inkbird_hum))
    return jsonResponse({ error: 'Invalid inkbird_hum' }, 400)

  // 4. INSERT no banco
  const row: Record<string, unknown> = { sensor_id }
  if (temperatura != null) row.temperatura = temperatura
  if (umidade != null)     row.umidade     = umidade
  if (rssi != null)        row.rssi        = rssi
  if (bateria_pct != null) row.bateria_pct  = bateria_pct
  
  // Novos campos Inkbird
  if (inkbird_temp != null) row.inkbird_temp = inkbird_temp
  if (inkbird_hum != null)  row.inkbird_hum  = inkbird_hum
  if (inkbird_bat != null)  row.inkbird_bat  = inkbird_bat

  // Se não tem nem DHT nem Inkbird, rejeita
  if (row.temperatura == null && row.inkbird_temp == null) {
      return jsonResponse({ error: 'No sensor data provided' }, 400)
  }

  const { error } = await supabase.from('sensor_leituras').insert(row)
  if (error) {
    console.error('Insert error:', error)
    return jsonResponse({ error: error.message }, 500)
  }

  // 5. Checar e disparar alertas (não bloqueia resposta ao ESP32)
  const sid = sensor_id as string
  const temp = temperatura as number
  const bat  = bateria_pct as number | null
  const wifi = rssi as number | null

  const checks: Promise<void>[] = []

  // ── Temperatura baixa ──────────────────────────────────────
  if (temp < TEMP_MIN) {
    checks.push(
      jaAlertado(sid, 'temp_baixa').then(async (ok) => {
        if (!ok) {
          await dispararAlerta({ tipo: 'temp_baixa', sensor_id: sid, valor: temp })
          await registrarCooldown(sid, 'temp_baixa')
        }
      })
    )
  }

  // ── Temperatura alta ───────────────────────────────────────
  if (temp > TEMP_MAX) {
    checks.push(
      jaAlertado(sid, 'temp_alta').then(async (ok) => {
        if (!ok) {
          await dispararAlerta({ tipo: 'temp_alta', sensor_id: sid, valor: temp })
          await registrarCooldown(sid, 'temp_alta')
        }
      })
    )
  }

  // ── WiFi fraco ─────────────────────────────────────────────
  if (wifi != null && wifi < RSSI_MIN) {
    checks.push(
      jaAlertado(sid, 'wifi_fraco').then(async (ok) => {
        if (!ok) {
          await dispararAlerta({ tipo: 'wifi_fraco', sensor_id: sid, rssi: wifi })
          await registrarCooldown(sid, 'wifi_fraco')
        }
      })
    )
  }

  // ── Bateria crítica (≤ 5%) — cooldown curto (60 min) ──────
  if (bat != null && bat <= BAT_CRIT) {
    checks.push(
      jaAlertado(sid, 'bateria_critica', 60).then(async (ok) => {
        if (!ok) {
          await dispararAlerta({ tipo: 'bateria_critica', sensor_id: sid, bateria: bat })
          await registrarCooldown(sid, 'bateria_critica')
        }
      })
    )
  }
  // ── Bateria fraca (≤ BAT_MIN% mas > 5%) — cooldown 60 min ──
  else if (bat != null && bat <= BAT_MIN) {
    checks.push(
      jaAlertado(sid, 'bateria_fraca', 60).then(async (ok) => {
        if (!ok) {
          await dispararAlerta({ tipo: 'bateria_fraca', sensor_id: sid, bateria: bat })
          await registrarCooldown(sid, 'bateria_fraca')
        }
      })
    )
  }

  // Roda tudo em paralelo sem bloquear a resposta ao ESP32
  if (checks.length > 0) {
    Promise.all(checks).catch((e) => console.error('Alertas paralelos error:', e))
  }

  return jsonResponse({ ok: true }, 201)
})
