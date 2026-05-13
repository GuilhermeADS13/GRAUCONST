// ============================================================
//  sensor-ingest — Gateway de inserção de leituras.
//
//  Endpoint:
//    POST /functions/v1/sensor-ingest
//    Header: X-Device-Token: <token>
//    Body:   { sensor_id, temperatura, umidade, rssi?, bateria_pct? }
//
//  bateria_pct: inteiro 0–100 (porcentagem da bateria LiPo)
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEVICE_TOKEN = Deno.env.get('DEVICE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  try { body = await req.json() }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }

  const { sensor_id, temperatura, umidade, rssi, bateria_pct } = body

  // 3. Validação
  if (typeof sensor_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(sensor_id))
    return jsonResponse({ error: 'Invalid sensor_id' }, 400)

  if (!isFiniteNumber(temperatura) || temperatura < -40 || temperatura > 80)
    return jsonResponse({ error: 'Invalid temperatura (-40..80)' }, 400)

  if (umidade != null && (!isFiniteNumber(umidade) || umidade < 0 || umidade > 100))
    return jsonResponse({ error: 'Invalid umidade (0..100)' }, 400)

  if (rssi != null && (!Number.isInteger(rssi) || (rssi as number) < -120 || (rssi as number) > 0))
    return jsonResponse({ error: 'Invalid rssi (-120..0)' }, 400)

  if (bateria_pct != null && (!Number.isInteger(bateria_pct) || (bateria_pct as number) < 0 || (bateria_pct as number) > 100))
    return jsonResponse({ error: 'Invalid bateria_pct (0..100)' }, 400)

  // 4. INSERT
  const row: Record<string, unknown> = { sensor_id, temperatura }
  if (umidade    != null) row.umidade     = umidade
  if (rssi       != null) row.rssi        = rssi
  if (bateria_pct != null) row.bateria_pct = bateria_pct

  const { error } = await supabase.from('sensor_leituras').insert(row)
  if (error) {
    console.error('Insert error:', error)
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ ok: true }, 201)
})
