// ============================================================
//  supabase.js — Cliente do Supabase e funções de leitura.
//
//  Responsabilidades:
//    1. Criar o cliente Supabase com URL e chave anon (env vars).
//    2. Expor `isSupabaseConfigured` para a UI saber se deve mostrar
//       a tela de "Configuração pendente" ou o dashboard.
//    3. Fornecer as queries usadas pelo App: última leitura e
//       histórico de um período (1h / 24h / 7d / 30d / etc).
//
//  Para adicionar uma nova query, crie uma função aqui e importe
//  no App.jsx.
// ============================================================

import { createClient } from '@supabase/supabase-js'

// Variáveis vêm do arquivo .env (local) ou Environment Variables do Vercel (produção).
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

// ── Última leitura ───────────────────────────────────────────
// Retorna o registro mais recente da tabela. Se a tabela estiver vazia,
// o Supabase devolve o erro código 'PGRST116' — tratamos como "sem dados"
// e retornamos null (não é erro real para a UI).
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
// Busca todas as leituras de um sensor no intervalo [now - periodoMs, now],
// ordenadas cronologicamente (para alimentar o gráfico).
//
// Parâmetros:
//   periodoMs → janela em milissegundos (ex.: 3600000 para 1h).
//   sensorId  → identificador do sensor; default bate com firmware.
//
// Limite de 5000 pontos para proteger o frontend em janelas longas.
// Com leituras a cada 15min, 30 dias dão ~2880 pontos — bem abaixo do limite.
export async function fetchHistorico(periodoMs, sensorId = 'DHT22-01') {
  if (!supabase) return []
  const since = new Date(Date.now() - periodoMs).toISOString()
  const { data, error } = await supabase
    .from('sensor_leituras')
    .select('id, temperatura, umidade, created_at')
    .eq('sensor_id', sensorId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) throw error
  return data || []
}
