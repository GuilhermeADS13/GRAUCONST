// ============================================================
//  supabase.js — Cliente do Supabase e funções de leitura.
//
//  Responsabilidades:
//    1. Criar o cliente Supabase com URL e chave publishable (env vars).
//    2. Expor `isSupabaseConfigured` para a UI decidir entre dashboard
//       e tela de "Configuração pendente".
//    3. Queries do dashboard:
//       - fetchSensores()        → lista de sensores ativos (multi-sensor)
//       - fetchUltimoRegistro()  → última leitura (filtrada por sensor)
//       - fetchHistorico()       → histórico em uma janela de tempo
//
//  Para adicionar uma nova query, crie uma função aqui e importe
//  no App.jsx.
// ============================================================

import { createClient } from '@supabase/supabase-js'

// Variáveis vêm do .env (local) ou Environment Variables do Vercel (produção).
// O prefixo VITE_ é obrigatório para o Vite expor para o frontend.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Flag usada pelo App.jsx para decidir se renderiza dashboard ou tela de setup.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

// Cliente nulo quando não configurado — evita crash no module load.
// Limite o Realtime a 2 eventos/segundo para economizar quota no plano free.
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 2 } },
    })
  : null

// ── Lista de sensores ativos ────────────────────────────────
// Retorna `[{ sensor_id, ultima_leitura }]` com sensores que mandaram
// dados nos últimos 30 dias. Ordenado pelo mais recente. Usado pelo
// SeletorSensor para popular o dropdown.
//
// Para incluir sensores "frios" (sem leitura recente), aumente a janela.
export async function fetchSensores() {
  if (!supabase) return []
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('sensor_leituras')
    .select('sensor_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  // Agrupa por sensor_id mantendo o created_at mais recente.
  const mapa = new Map()
  for (const linha of data || []) {
    if (!mapa.has(linha.sensor_id)) mapa.set(linha.sensor_id, linha.created_at)
  }
  return Array.from(mapa, ([sensor_id, ultima_leitura]) => ({ sensor_id, ultima_leitura }))
}

// ── Última leitura ───────────────────────────────────────────
// Retorna o registro mais recente do sensor pedido. Se nada existe,
// o Supabase devolve PGRST116 — tratamos como "sem dados" (null).
export async function fetchUltimoRegistro(sensorId = null) {
  if (!supabase) return null
  let q = supabase
    .from('sensor_leituras')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
  if (sensorId) q = q.eq('sensor_id', sensorId)
  const { data, error } = await q.single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

// ── Histórico por período ────────────────────────────────────
// Leituras no intervalo [now - periodoMs, now], ordenadas cronologicamente.
// Sensor padrão (null) retorna o sensor único caso só tenha 1 — chamador
// deve passar `sensorId` explícito quando trabalha com multi-sensor.
//
// Limite de 5000 pontos protege o frontend em janelas longas.
export async function fetchHistorico(periodoMs, sensorId = null) {
  if (!supabase) return []
  const since = new Date(Date.now() - periodoMs).toISOString()
  let q = supabase
    .from('sensor_leituras')
    .select('id, temperatura, umidade, bateria_v, rssi, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (sensorId) q = q.eq('sensor_id', sensorId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
