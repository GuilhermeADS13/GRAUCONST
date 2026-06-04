// ============================================================
//  supabase.js — Cliente do Supabase e funções de leitura.
//
//  Responsabilidades:
//    1. Criar o cliente Supabase com URL e anon key (env vars).
//    2. Expor `isSupabaseConfigured` para a UI decidir entre dashboard
//       e tela de "Configuração pendente".
//    3. Queries do dashboard:
//       - fetchUltimoRegistro() → última leitura do sensor
//       - fetchHistorico()      → histórico em uma janela de tempo
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 2 } },
    })
  : null

// ── Última leitura ───────────────────────────────────────────
export async function fetchUltimoRegistro() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('sensor_leituras')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

// ── Histórico por período ────────────────────────────────────
export async function fetchHistorico(periodoMs) {
  if (!supabase) return []
  const since = new Date(Date.now() - periodoMs).toISOString()
  const { data, error } = await supabase
    .from('sensor_leituras')
    .select('id, temperatura, umidade, bateria_pct, rssi, inkbird_temp, inkbird_hum, inkbird_bat, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) throw error
  return data || []
}
