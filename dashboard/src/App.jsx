// ============================================================
//  App.jsx — Componente raiz do dashboard.
//
//  Estrutura:
//    1. App           → decide entre SetupNeeded e Dashboard.
//    2. Dashboard     → tela principal (cards + filtros + gráfico).
//    3. classificar*  → funções utilitárias para colorir os cards.
//    4. PERIODOS      → mapa de janelas disponíveis (1h/24h/7d/30d).
//
//  Fluxo de dados:
//    - Ao montar e ao trocar período, chama `carregar()` que faz duas
//      queries em paralelo (última leitura + histórico no período).
//    - Inscreve um canal Realtime: cada INSERT atualiza o estado sem
//      polling. O filtro de período é reaplicado no callback.
//
//  Onde mexer:
//    - Faixas de classificação: edite classificarTemp/classificarUmidade.
//    - Adicionar/remover períodos: edite a constante PERIODOS abaixo.
//    - Layout: o JSX está dividido por comentários de seção.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase, fetchUltimoRegistro, fetchHistorico, isSupabaseConfigured } from './lib/supabase'
import { StatCard } from './components/StatCard'
import { GraficoTemperatura } from './components/GraficoTemperatura'
import { LiveBadge } from './components/LiveBadge'
import { SetupNeeded } from './components/SetupNeeded'
import { SeletorPeriodo } from './components/SeletorPeriodo'

// ── Períodos disponíveis ─────────────────────────────────────
// `ms` é a janela em milissegundos; `label` é exibido no botão;
// `tituloChart` é usado no cabeçalho do gráfico;
// `formatoEixo` indica se o eixo X mostra hora ou data.
const PERIODOS = {
  '1h': { label: '1h', ms: 60 * 60 * 1000, tituloChart: 'Última hora', formatoEixo: 'hora' },
  '24h': {
    label: '24h',
    ms: 24 * 60 * 60 * 1000,
    tituloChart: 'Últimas 24 horas',
    formatoEixo: 'hora',
  },
  '7d': {
    label: '7d',
    ms: 7 * 24 * 60 * 60 * 1000,
    tituloChart: 'Últimos 7 dias',
    formatoEixo: 'data',
  },
  '30d': {
    label: '30d',
    ms: 30 * 24 * 60 * 60 * 1000,
    tituloChart: 'Últimos 30 dias',
    formatoEixo: 'data',
  },
}

// Array no formato { chave, label } consumido pelo SeletorPeriodo.
const OPCOES_PERIODO = Object.entries(PERIODOS).map(([chave, p]) => ({ chave, label: p.label }))

// ── Helpers ──────────────────────────────────────────────────

// Formata ISO timestamp para "dd/mm/aaaa hh:mm:ss" no fuso do navegador.
function formatDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Devolve label + cor do card de temperatura. Ajuste os limites se quiser.
function classificarTemp(t) {
  if (t === null) return { label: '—', cor: 'blue' }
  if (t < 18) return { label: '❄️ Frio', cor: 'blue' }
  if (t < 25) return { label: '✅ Confortável', cor: 'teal' }
  if (t < 30) return { label: '☀️ Quente', cor: 'amber' }
  return { label: '🔥 Muito quente', cor: 'red' }
}

// Devolve label + cor do card de umidade. Ajuste as faixas se quiser.
function classificarUmidade(u) {
  if (u === null) return { label: '—', cor: 'blue' }
  if (u < 30) return { label: '🏜️ Seco', cor: 'amber' }
  if (u < 60) return { label: '✅ Confortável', cor: 'teal' }
  return { label: '💧 Úmido', cor: 'blue' }
}

// ── App ──────────────────────────────────────────────────────
// Se faltam env vars, mostra tela de setup; senão delega para o Dashboard.
export default function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />
  return <Dashboard />
}

// ── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  // Estado: dados, flags de loading/erro/realtime e período selecionado.
  const [ultimo, setUltimo] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [realtime, setRealtime] = useState(false)
  const [novoDado, setNovoDado] = useState(false)
  const [erro, setErro] = useState(null)
  const [periodo, setPeriodo] = useState('24h')

  const periodoConfig = PERIODOS[periodo]

  // ── Função de carga ─────────────────────────────────────────
  // Recarrega tudo (última + histórico). Roda no mount, ao trocar período,
  // e ao clicar "Atualizar Agora".
  const carregar = useCallback(
    async (spinner = false) => {
      if (spinner) setAtualizando(true)
      setErro(null)
      try {
        const [ult, hist] = await Promise.all([
          fetchUltimoRegistro(),
          fetchHistorico(periodoConfig.ms),
        ])
        setUltimo(ult)
        setHistorico(hist)
      } catch (e) {
        setErro(e?.message || 'Erro ao buscar dados. Verifique a configuração do Supabase.')
      } finally {
        setLoading(false)
        setAtualizando(false)
      }
    },
    [periodoConfig.ms]
  )

  // Recarrega sempre que o período mudar.
  useEffect(() => {
    setLoading(true)
    carregar()
  }, [carregar])

  // ── Subscription Realtime ───────────────────────────────────
  // Escuta INSERTs e atualiza estado. O filtro de tempo é refeito com o
  // período atual para não acumular registros fora da janela.
  useEffect(() => {
    const ch = supabase
      .channel('sensor_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_leituras' },
        ({ new: novo }) => {
          setUltimo(novo)
          setHistorico((prev) => {
            const corte = new Date(Date.now() - periodoConfig.ms)
            return [...prev.filter((d) => new Date(d.created_at) > corte), novo]
          })
          setNovoDado(true)
          setTimeout(() => setNovoDado(false), 3000)
        }
      )
      .subscribe((status) => setRealtime(status === 'SUBSCRIBED'))
    return () => {
      supabase.removeChannel(ch)
      setRealtime(false)
    }
  }, [periodoConfig.ms])

  // ── Derivações para a UI ────────────────────────────────────
  const temp = ultimo ? parseFloat(ultimo.temperatura) : null
  const umid = ultimo && ultimo.umidade != null ? parseFloat(ultimo.umidade) : null
  const tInfo = classificarTemp(temp)
  const uInfo = classificarUmidade(umid)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Cabeçalho fixo ── */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌡️</span>
            <div>
              <h1 className="text-base font-black text-white leading-none tracking-tight">
                GRAUCONST
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Monitor IoT · ESP32 + DHT22</p>
            </div>
          </div>
          <LiveBadge realtime={realtime} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* ── Banner de erro ── */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
            <span>⚠️</span>
            <p className="text-red-400 text-sm font-medium">{erro}</p>
          </div>
        )}

        {/* ── Banner de dado novo (3s) ── */}
        {novoDado && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 flex items-center gap-3">
            <span className="text-lg">📡</span>
            <p className="text-green-400 text-sm font-bold">Novo dado recebido via Realtime!</p>
          </div>
        )}

        {/* ── Cards de leitura atual ── */}
        <section>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Leitura atual
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              icon="🌡️"
              label="Temperatura"
              value={loading ? null : temp?.toFixed(1)}
              unit="°C"
              status={tInfo.label}
              cor={tInfo.cor}
            />
            <StatCard
              icon="💧"
              label="Umidade"
              value={loading ? null : umid?.toFixed(1)}
              unit="%"
              status={uInfo.label}
              cor={uInfo.cor}
            />
          </div>
        </section>

        {/* ── Metadados do sensor ── */}
        {!loading && ultimo && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Sensor</p>
              <p className="text-white font-semibold">{ultimo.sensor_id}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Última leitura</p>
              <p className="text-white font-semibold text-xs leading-relaxed">
                {formatDataHora(ultimo.created_at)}
              </p>
            </div>
          </div>
        )}

        {/* ── Gráfico com seletor de período ── */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              📈 {periodoConfig.tituloChart}
            </h2>
            <SeletorPeriodo valor={periodo} onChange={setPeriodo} opcoes={OPCOES_PERIODO} />
          </div>
          <div className="flex items-center justify-end mb-4">
            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-1 rounded-lg">
              {historico.length} registros
            </span>
          </div>
          <GraficoTemperatura
            dados={historico}
            loading={loading}
            formatoEixo={periodoConfig.formatoEixo}
          />
        </section>

        {/* ── Botão refazer query manual ── */}
        <div className="flex justify-center pb-4">
          <button
            onClick={() => carregar(true)}
            disabled={atualizando}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold px-10 py-3 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/30"
          >
            {atualizando ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Atualizando...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Atualizar Agora</span>
              </>
            )}
          </button>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-slate-700 border-t border-slate-900">
        GRAUCONST · IoT Monitor via ESP32 + Supabase
      </footer>
    </div>
  )
}
