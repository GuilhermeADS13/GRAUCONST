// ============================================================
// sensor-ingest — Gateway de inserção de leituras.
//
// Endpoint:
//   POST /functions/v1/sensor-ingest
//   Header: X-Device-Token: <token>
//   Body: { sensor_id, temperatura?, umidade?, rssi?, bateria_pct?,
//           inkbird_temp?, inkbird_hum?, inkbird_bat?,
//           esp32_bat_pct? }
//
//   Alertas de bateria:
//     inkbird_bat  → bateria do sensor Inkbird (BLE)
//     esp32_bat_pct → bateria do pack 2S do ESP32 (GPIO34)
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEVICE_TOKEN = Deno.env.get('DEVICE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TEMP_MIN  = parseFloat(Deno.env.get('ALERTA_TEMP_MIN')  ?? '-20')
const TEMP_MAX  = parseFloat(Deno.env.get('ALERTA_TEMP_MAX')  ?? '-5')
const RSSI_MIN  = parseInt(Deno.env.get('ALERTA_RSSI_MIN')    ?? '-85')
const BAT_MIN   = parseInt(Deno.env.get('ALERTA_BAT_MIN')     ?? '20')
const BAT_CRIT  = 5

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

async function temAlertaAtivo(sensor_id: string, tipos: string[]): Promise<boolean> {
  const { data } = await supabase
    .from('alerta_cooldown')
    .select('id')
    .eq('sensor_id', sensor_id)
    .in('tipo', tipos)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

async function limparAlerta(sensor_id: string, tipos: string[]) {
  await supabase.from('alerta_cooldown').delete().eq('sensor_id', sensor_id).in('tipo', tipos)
}

async function checarRecuperacao(
  sensor_id: string,
  tiposAlerta: string[],
  tipoOk: string,
  extra: { valor?: number; rssi?: number; bateria?: number },
) {
  if (await temAlertaAtivo(sensor_id, tiposAlerta)) {
    await dispararAlerta({ tipo: tipoOk, sensor_id, ...extra })
    await limparAlerta(sensor_id, tiposAlerta)
  }
}

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  if (!DEVICE_TOKEN) {
    console.error('DEVICE_TOKEN não configurado')
    return jsonResponse({ error: 'Server not configured' }, 500)
  }

  const token = req.headers.get('x-device-token')
  if (!token || token !== DEVICE_TOKEN)
    return jsonResponse({ error: 'Invalid or missing X-Device-Token' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const {
    sensor_id, temperatura, umidade, rssi, bateria_pct,
    inkbird_temp, inkbird_hum, inkbird_bat,
    esp32_bat_pct,
  } = body

  // Validações
  if (typeof sensor_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(sensor_id))
    return jsonResponse({ error: 'Invalid sensor_id' }, 400)
  if (temperatura != null && (!isFiniteNumber(temperatura) || temperatura < -40 || temperatura > 80))
    return jsonResponse({ error: 'Invalid temperatura (-40..80)' }, 400)
  if (umidade != null && (!isFiniteNumber(umidade) || umidade < 0 || umidade > 100))
    return jsonResponse({ error: 'Invalid umidade (0..100)' }, 400)
  if (rssi != null && (!Number.isInteger(rssi) || (rssi as number) < -120 || (rssi as number) > 0))
    return jsonResponse({ error: 'Invalid rssi (-120..0)' }, 400)
  if (bateria_pct != null && (!Number.isInteger(bateria_pct) || (bateria_pct as number) < 0 || (bateria_pct as number) > 100))
    return jsonResponse({ error: 'Invalid bateria_pct (0..100)' }, 400)
  if (inkbird_temp != null && (!isFiniteNumber(inkbird_temp) || inkbird_temp < -40 || inkbird_temp > 80))
    return jsonResponse({ error: 'Invalid inkbird_temp (-40..80)' }, 400)
  if (inkbird_hum != null && !isFiniteNumber(inkbird_hum))
    return jsonResponse({ error: 'Invalid inkbird_hum' }, 400)
  if (inkbird_bat != null && (!Number.isInteger(inkbird_bat) || (inkbird_bat as number) < 0 || (inkbird_bat as number) > 100))
    return jsonResponse({ error: 'Invalid inkbird_bat (0..100)' }, 400)
  if (esp32_bat_pct != null && (!Number.isInteger(esp32_bat_pct) || (esp32_bat_pct as number) < 0 || (esp32_bat_pct as number) > 100))
    return jsonResponse({ error: 'Invalid esp32_bat_pct (0..100)' }, 400)

  // Temperatura/umidade efetivas
  const tempEfetiva = isFiniteNumber(temperatura)
    ? temperatura
    : isFiniteNumber(inkbird_temp) ? inkbird_temp : null
  const umidEfetiva = isFiniteNumber(umidade)
    ? umidade
    : isFiniteNumber(inkbird_hum) ? inkbird_hum : null

  if (tempEfetiva == null)
    return jsonResponse({ error: 'No temperature data (neither DHT nor Inkbird)' }, 400)

  // INSERT
  const row: Record<string, unknown> = { sensor_id, temperatura: tempEfetiva }
  if (umidEfetiva != null)   row.umidade      = umidEfetiva
  if (rssi != null)          row.rssi         = rssi
  if (bateria_pct != null)   row.bateria_pct  = bateria_pct
  if (inkbird_temp != null)  row.inkbird_temp = inkbird_temp
  if (inkbird_hum != null)   row.inkbird_hum  = inkbird_hum
  if (inkbird_bat != null)   row.inkbird_bat  = inkbird_bat
  if (esp32_bat_pct != null) row.esp32_bat_pct = esp32_bat_pct

  const { error } = await supabase.from('sensor_leituras').insert(row)
  if (error) {
    console.error('Insert error:', error)
    return jsonResponse({ error: error.message }, 500)
  }

  const sid = sensor_id as string
  const temp = tempEfetiva
  const inkBat = isFiniteNumber(inkbird_bat) ? (inkbird_bat as number) : null
  // Bateria do ESP32: aceita esp32_bat_pct (FW 1.2.0) ou bateria_pct (FW 1.1.0).
  const esp32Bat = isFiniteNumber(esp32_bat_pct)
    ? (esp32_bat_pct as number)
    : isFiniteNumber(bateria_pct) ? (bateria_pct as number) : null
  const wifi = rssi as number | null

  const checks: Promise<void>[] = []

  // ── Temperatura ────────────────────────────────────────────
  if (temp > TEMP_MAX) {
    checks.push(jaAlertado(sid, 'temp_alta').then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'temp_alta', sensor_id: sid, valor: temp }); await registrarCooldown(sid, 'temp_alta') }
    }))
  } else if (temp < TEMP_MIN) {
    checks.push(jaAlertado(sid, 'temp_baixa').then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'temp_baixa', sensor_id: sid, valor: temp }); await registrarCooldown(sid, 'temp_baixa') }
    }))
  } else {
    checks.push(checarRecuperacao(sid, ['temp_alta', 'temp_baixa'], 'temp_ok', { valor: temp }))
  }

  // ── WiFi ───────────────────────────────────────────────────
  if (wifi != null && wifi < RSSI_MIN) {
    checks.push(jaAlertado(sid, 'wifi_fraco').then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'wifi_fraco', sensor_id: sid, rssi: wifi }); await registrarCooldown(sid, 'wifi_fraco') }
    }))
  } else if (wifi != null) {
    checks.push(checarRecuperacao(sid, ['wifi_fraco'], 'wifi_ok', { rssi: wifi }))
  }

  // ── Bateria Inkbird ────────────────────────────────────────
  if (inkBat != null && inkBat <= BAT_CRIT) {
    checks.push(jaAlertado(sid, 'bateria_critica', 60).then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'bateria_critica', sensor_id: sid, bateria: inkBat }); await registrarCooldown(sid, 'bateria_critica') }
    }))
  } else if (inkBat != null && inkBat <= BAT_MIN) {
    checks.push(jaAlertado(sid, 'bateria_fraca', 60).then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'bateria_fraca', sensor_id: sid, bateria: inkBat }); await registrarCooldown(sid, 'bateria_fraca') }
    }))
  } else if (inkBat != null) {
    checks.push(checarRecuperacao(sid, ['bateria_critica', 'bateria_fraca'], 'bateria_ok', { bateria: inkBat }))
  }

  // ── Bateria ESP32 (pack 2S) ────────────────────────────────
  // Alerta separado com prefixo "esp32_bat_" para não colidir com Inkbird
  if (esp32Bat != null && esp32Bat <= BAT_CRIT) {
    checks.push(jaAlertado(sid, 'esp32_bat_critica', 60).then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'esp32_bat_critica', sensor_id: sid, bateria: esp32Bat }); await registrarCooldown(sid, 'esp32_bat_critica') }
    }))
  } else if (esp32Bat != null && esp32Bat <= BAT_MIN) {
    checks.push(jaAlertado(sid, 'esp32_bat_fraca', 60).then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'esp32_bat_fraca', sensor_id: sid, bateria: esp32Bat }); await registrarCooldown(sid, 'esp32_bat_fraca') }
    }))
  } else if (esp32Bat != null) {
    checks.push(checarRecuperacao(sid, ['esp32_bat_critica', 'esp32_bat_fraca'], 'esp32_bat_ok', { bateria: esp32Bat }))
  }

  await Promise.allSettled(checks)
  return jsonResponse({ ok: true, sensor_id: sid }, 201)
})
