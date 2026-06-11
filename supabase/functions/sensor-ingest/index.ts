// ============================================================
// sensor-ingest — Gateway de inserção de leituras.
//
// Endpoint:
//   POST /functions/v1/sensor-ingest
//   Header: X-Device-Token: <token>
//   Body: { sensor_id, temperatura?, umidade?, rssi?, bateria_pct?,
//           inkbird_temp?, inkbird_hum?, inkbird_bat? }
//
//   Temperatura/umidade "efetivas" = DHT se presente, senão Inkbird.
//   `temperatura` é NOT NULL no schema, então a efetiva alimenta essa coluna;
//   os valores brutos do Inkbird também vão para inkbird_temp/hum/bat.
//
// Alertas (temperatura efetiva + bateria do Inkbird), com aviso de
// normalização quando a condição volta ao normal:
//   - temp < TEMP_MIN / > TEMP_MAX   → temp_baixa / temp_alta   (↺ temp_ok)
//   - rssi < RSSI_MIN                → wifi_fraco               (↺ wifi_ok)
//   - inkbird_bat ≤ 5 / ≤ BAT_MIN    → bateria_critica / fraca  (↺ bateria_ok)
//   - sensor volta a enviar          → watchdog_ok
//   (sem alerta de umidade)
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEVICE_TOKEN = Deno.env.get('DEVICE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Limites de alerta
const TEMP_MIN  = parseFloat(Deno.env.get('ALERTA_TEMP_MIN')  ?? '-20')
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

// ── Recuperação ("normalizou") ───────────────────────────────
// Há algum alerta ativo (cooldown registrado) para algum desses tipos?
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

// Se havia alerta ativo e a condição voltou ao normal: envia o aviso de
// normalização (uma vez) e limpa o estado para permitir alertar de novo no futuro.
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
  if (inkbird_temp != null && (!isFiniteNumber(inkbird_temp) || inkbird_temp < -40 || inkbird_temp > 80))
    return jsonResponse({ error: 'Invalid inkbird_temp (-40..80)' }, 400)
  if (inkbird_hum != null && !isFiniteNumber(inkbird_hum))
    return jsonResponse({ error: 'Invalid inkbird_hum' }, 400)
  if (inkbird_bat != null && (!Number.isInteger(inkbird_bat) || (inkbird_bat as number) < 0 || (inkbird_bat as number) > 100))
    return jsonResponse({ error: 'Invalid inkbird_bat (0..100)' }, 400)

  // 4. Temperatura/umidade efetivas: usa o DHT se houver, senão cai pro Inkbird.
  //    Sem DHT, o Inkbird é o sensor principal — e `temperatura` é NOT NULL no schema.
  const tempEfetiva = isFiniteNumber(temperatura)
    ? temperatura
    : isFiniteNumber(inkbird_temp) ? inkbird_temp : null
  const umidEfetiva = isFiniteNumber(umidade)
    ? umidade
    : isFiniteNumber(inkbird_hum) ? inkbird_hum : null

  // Sem nenhuma fonte de temperatura (nem DHT nem Inkbird), rejeita.
  if (tempEfetiva == null)
    return jsonResponse({ error: 'No temperature data (neither DHT nor Inkbird)' }, 400)

  // 5. INSERT no banco
  const row: Record<string, unknown> = { sensor_id, temperatura: tempEfetiva }
  if (umidEfetiva != null) row.umidade     = umidEfetiva
  if (rssi != null)        row.rssi        = rssi
  if (bateria_pct != null) row.bateria_pct = bateria_pct

  // Valores brutos do Inkbird (preserva o original do sensor)
  if (inkbird_temp != null) row.inkbird_temp = inkbird_temp
  if (inkbird_hum != null)  row.inkbird_hum  = inkbird_hum
  if (inkbird_bat != null)  row.inkbird_bat  = inkbird_bat

  const { error } = await supabase.from('sensor_leituras').insert(row)
  if (error) {
    console.error('Insert error:', error)
    return jsonResponse({ error: error.message }, 500)
  }

  // 6. Checar alertas + recuperações (não bloqueia a resposta ao ESP32).
  //    temp = temperatura efetiva (Inkbird); bateria = bateria do Inkbird (inkbird_bat).
  const sid = sensor_id as string
  const temp = tempEfetiva
  const inkBat = isFiniteNumber(inkbird_bat) ? (inkbird_bat as number) : null
  const wifi = rssi as number | null

  const checks: Promise<void>[] = []

  // ── Temperatura: alta / baixa / normalizou ─────────────────
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

  // ── WiFi: fraco / normalizou ───────────────────────────────
  if (wifi != null && wifi < RSSI_MIN) {
    checks.push(jaAlertado(sid, 'wifi_fraco').then(async (ok) => {
      if (!ok) { await dispararAlerta({ tipo: 'wifi_fraco', sensor_id: sid, rssi: wifi }); await registrarCooldown(sid, 'wifi_fraco') }
    }))
  } else if (wifi != null) {
    checks.push(checarRecuperacao(sid, ['wifi_fraco'], 'wifi_ok', { rssi: wifi }))
  }

  // ── Bateria do Inkbird: crítica / fraca / normalizou ───────
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

  // ── Sensor voltou online: limpa o estado do watchdog e avisa ──
  checks.push(checarRecuperacao(sid, ['watchdog'], 'watchdog_ok', {}))

  // Roda tudo em paralelo sem bloquear a resposta ao ESP32
  if (checks.length > 0) {
    Promise.all(checks).catch((e) => console.error('Alertas paralelos error:', e))
  }

  return jsonResponse({ ok: true }, 201)
})
