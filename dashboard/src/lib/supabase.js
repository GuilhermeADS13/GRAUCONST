import { createClient } from '@supabase/supabase-js'

// ── Substitua pelos valores do seu projeto Supabase ──────────
// Settings → API → Project URL e anon/public key
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://XXXXXXXXXXXX.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
})

// ── Busca o último registro ──────────────────────────────────
export async function fetchUltimoRegistro() {
  const { data, error } = await supabase
    .from('sensor_leituras')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

// ── Busca histórico das últimas 24h ─────────────────────────
export async function fetchHistorico24h(sensorId = 'DHT22-01') {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('sensor_leituras')
    .select('id, temperatura, umidade, created_at')
    .eq('sensor_id', sensorId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}
