// ============================================================
//  sensor-ingest — Gateway de inserção de leituras.
//
//  Por quê existe:
//    A RLS da tabela `sensor_leituras` bloqueia INSERT direto via anon
//    key. Apenas esta Edge Function (rodando com service_role) consegue
//    inserir. Isso impede que qualquer pessoa com a chave pública envie
//    dados falsos para o seu banco.
//
//  Como funciona:
//    1. Recebe POST com JSON do ESP32.
//    2. Valida o header `X-Device-Token` contra o secret DEVICE_TOKEN.
//    3. Valida estrutura/limites do payload (defesa em profundidade).
//    4. Insere usando o cliente service_role (bypassa RLS).
//
//  Configuração (uma vez, via Supabase Dashboard → Project Settings →
//  Edge Functions → Secrets, ou via CLI `supabase secrets set`):
//    DEVICE_TOKEN = <token forte de 32+ bytes hex>
//  As variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas
//  automaticamente pela plataforma.
//
//  Endpoint:
//    POST https://<project>.supabase.co/functions/v1/sensor-ingest
//    Headers:  X-Device-Token: <token>
//    Body:     { sensor_id, temperatura, umidade, rssi?, bateria_v? }
//
//  Respostas:
//    201 Created   — leitura inserida
//    400 Bad Req   — payload inválido
//    401 Unauth    — token ausente ou incorreto
//    500 Internal  — erro inesperado no insert
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEVICE_TOKEN = Deno.env.get('DEVICE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Cliente com service_role: bypassa RLS para que o INSERT funcione mesmo
// com a policy de INSERT removida da tabela.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

// Helpers de validação (defesa em profundidade — RLS já tem CHECKs).
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
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Configuração crítica ausente — falha clara.
  if (!DEVICE_TOKEN) {
    console.error('DEVICE_TOKEN secret não configurado')
    return jsonResponse({ error: 'Server not configured' }, 500)
  }

  // 1. Autenticação por device token (header customizado).
  const token = req.headers.get('x-device-token')
  if (!token || token !== DEVICE_TOKEN) {
    return jsonResponse({ error: 'Invalid or missing X-Device-Token' }, 401)
  }

  // 2. Parse do JSON.
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  // 3. Validação de campos.
  const sensor_id = body.sensor_id
  const temperatura = body.temperatura
  const umidade = body.umidade
  const rssi = body.rssi
  const bateria_v = body.bateria_v

  if (typeof sensor_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(sensor_id)) {
    return jsonResponse({ error: 'Invalid sensor_id (use [A-Za-z0-9_-], 1..64)' }, 400)
  }
  if (!isFiniteNumber(temperatura) || temperatura < -40 || temperatura > 80) {
    return jsonResponse({ error: 'Invalid temperatura (range -40..80)' }, 400)
  }
  if (umidade != null && (!isFiniteNumber(umidade) || umidade < 0 || umidade > 100)) {
    return jsonResponse({ error: 'Invalid umidade (range 0..100)' }, 400)
  }
  if (rssi != null && (!Number.isInteger(rssi) || (rssi as number) < -120 || (rssi as number) > 0)) {
    return jsonResponse({ error: 'Invalid rssi (range -120..0)' }, 400)
  }
  if (
    bateria_v != null &&
    (!isFiniteNumber(bateria_v) || bateria_v < 0 || bateria_v > 20)
  ) {
    return jsonResponse({ error: 'Invalid bateria_v (range 0..20)' }, 400)
  }

  // 4. INSERT usando service_role (bypassa RLS).
  const row: Record<string, unknown> = { sensor_id, temperatura }
  if (umidade != null) row.umidade = umidade
  if (rssi != null) row.rssi = rssi
  if (bateria_v != null) row.bateria_v = bateria_v

  const { error } = await supabase.from('sensor_leituras').insert(row)
  if (error) {
    console.error('Insert error:', error)
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ ok: true }, 201)
})
