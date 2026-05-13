// ============================================================
//  App.jsx — Componente raiz do dashboard.
//
//  Estrutura:
//    1. App           → decide entre SetupNeeded e Dashboard.
//    2. Dashboard     → tela principal (multi-sensor + cards + filtros + gráfico).
//    3. classificar*  → funções utilitárias para colorir os cards.
//    4. PERIODOS      → mapa de janelas disponíveis (1h/24h/7d/30d).
//
//  Fluxo de dados:
//    - Ao montar, busca lista de sensores e seleciona o primeiro (mais recente).
//    - Ao trocar sensor ou período, recarrega tudo em paralelo.
//    - Realtime: cada INSERT que bate com `sensorAtivo` atualiza estado
//      sem polling. O filtro de período é reaplicado no callback.
//
//  Onde mexer:
//    - Faixas de classificação: edite classificarTemp/classificarUmidade.
//    - Adicionar/remover períodos: edite a constante PERIODOS abaixo.
//    - Layout: o JSX está dividido por comentários de seção.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  supabase,
  fetchSensores,
  fetchUltimoRegistro,
  fetchHistorico,
  isSupabaseConfigured,
} from './lib/supabase'
import { StatCard } from './components/StatCard'
import { GraficoTemperatura } from './components/GraficoTemperatura'
import { LiveBadge } from './components/LiveBadge'
import { SetupNeeded } from './components/SetupNeeded'
import { SeletorPeriodo } from './components/SeletorPeriodo'
import { SeletorSensor } from './components/SeletorSensor'

// ── Períodos disponíveis ─────────────────────────────────────
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

const OPCOES_PERIODO = Object.entries(PERIODOS).map(([chave, p]) => ({ chave, label: p.label }))

// ── Helpers ──────────────────────────────────────────────────

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

function classificarTemp(t) {
  if (t === null) return { label: '—', cor: 'blue' }
  if (t < 18) return { label: '❄️ Frio', cor: 'blue' }
  if (t < 25) return { label: '✅ Confortável', cor: 'teal' }
  if (t < 30) return { label: '☀️ Quente', cor: 'amber' }
  return { label: '🔥 Muito quente', cor: 'red' }
}

function classificarUmidade(u) {
  if (u === null) return { label: '—', cor: 'blue' }
  if (u < 30) return { label: '🏜️ Seco', cor: 'amber' }
  if (u < 60) return { label: '✅ Confortável', cor: 'teal' }
  return { label: '💧 Úmido', cor: 'blue' }
}

// Converte RSSI (dBm) para 0-4 barras. -50 ou melhor = 4 barras; pior que -90 = 0.
function rssiBarras(rssi) {
  if (rssi == null) return null
  if (rssi >= -50) return 4
  if (rssi >= -65) return 3
  if (rssi >= -75) return 2
  if (rssi >= -85) return 1
  return 0
}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />
  return <Dashboard />
}

// ── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  const [sensores, setSensores] = useState([])
  const [sensorAtivo, setSensorAtivo] = useState(null)
  const [ultimo, setUltimo] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [realtime, setRealtime] = useState(false)
  const [novoDado, setNovoDado] = useState(false)
  const [erro, setErro] = useState(null)
  const [periodo, setPeriodo] = useState('24h')

  const periodoConfig = PERIODOS[periodo]

  // ── Carrega lista de sensores ao montar ─────────────────────
  // Define o primeiro como ativo (mais recente). Re-executa só se o
  // dashboard for desmontado/remontado.
  useEffect(() => {
    fetchSensores()
      .then((lista) => {
        setSensores(lista)
        if (lista.length > 0) setSensorAtivo(lista[0].sensor_id)
        else setLoading(false) // sem sensores: para de mostrar spinner
      })
      .catch((e) => {
        setErro(e?.message || 'Erro ao buscar sensores.')
        setLoading(false)
      })
  }, [])

  // ── Função de carga (depende de sensor + período) ───────────
  const carregar = useCallback(
    async (spinner = false) => {
      if (!sensorAtivo) return
      if (spinner) setAtualizando(true)
      setErro(null)
      try {
        const [ult, hist] = await Promise.all([
          fetchUltimoRegistro(sensorAtivo),
          fetchHistorico(periodoConfig.ms, sensorAtivo),
        ])
        setUltimo(ult)
        setHistorico(hist)
      } catch (e) {
        setErro(e?.message || 'Erro ao buscar dados.')
      } finally {
        setLoading(false)
        setAtualizando(false)
      }
    },
    [sensorAtivo, periodoConfig.ms]
  )

  // Recarrega quando sensor ou período mudam.
  useEffect(() => {
    if (sensorAtivo) {
      setLoading(true)
      carregar()
    }
  }, [carregar, sensorAtivo])

  // ── Subscription Realtime ───────────────────────────────────
  // Filtra eventos pelo sensorAtivo (server-side via `filter`) e refaz
  // a janela de tempo do histórico no cliente.
  useEffect(() => {
    if (!sensorAtivo) return
    const ch = supabase
      .channel(`sensor_realtime_${sensorAtivo}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sensor_leituras',
          filter: `sensor_id=eq.${sensorAtivo}`,
        },
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
  }, [sensorAtivo, periodoConfig.ms])

  // ── Derivações para a UI ────────────────────────────────────
  const temp = ultimo ? parseFloat(ultimo.temperatura) : null
  const umid = ultimo && ultimo.umidade != null ? parseFloat(ultimo.umidade) : null
  const bat = ultimo && ultimo.bateria_v != null ? parseFloat(ultimo.bateria_v) : null
  const rssi = ultimo && ultimo.rssi != null ? ultimo.rssi : null
  const barrasRssi = rssiBarras(rssi)
  const tInfo = classificarTemp(temp)
  const uInfo = classificarUmidade(umid)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Cabeçalho ── */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <img
              src="https://media.base44.com/images/public/69f39c8449a653fae9af2e44/174aed001_LOGO_GRAUCONST.png"
              alt="GrauConst"
              className="h-12 w-auto object-contain"
            />
            <div>
              <h1 className="text-base font-black text-white leading-none tracking-tight">
                GrauConst
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-medium tracking-wide">
                · Automação Industrial ·
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SeletorSensor valor={sensorAtivo} onChange={setSensorAtivo} sensores={sensores} />
            <LiveBadge realtime={realtime} />
          </div>
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

        {/* ── Cards de leitura atual (temperatura + umidade) ── */}
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

        {/* ── Metadados do sensor (id, timestamp, bateria, RSSI) ── */}
        {!loading && ultimo && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Sensor</p>
              <p className="text-white font-semibold font-mono text-xs">{ultimo.sensor_id}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Última leitura</p>
              <p className="text-white font-semibold text-xs leading-relaxed">
                {formatDataHora(ultimo.created_at)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Bateria</p>
              <p className="text-white font-semibold">
                {bat != null ? `${bat.toFixed(2)} V` : <span className="text-slate-600">—</span>}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Sinal WiFi</p>
              <p className="text-white font-semibold flex items-baseline gap-1">
                {rssi != null ? (
                  <>
                    <span>{rssi} dBm</span>
                    <span className="text-xs text-slate-500">
                      ({'▮'.repeat(barrasRssi)}
                      {'▯'.repeat(4 - barrasRssi)})
                    </span>
                  </>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
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

      <footer className="border-t border-slate-900 py-6 mt-4">
        <div className="flex flex-col items-center gap-3">
          <img
            src="https://media.base44.com/images/public/69f39c8449a653fae9af2e44/174aed001_LOGO_GRAUCONST.png"
            alt="GrauConst"
            className="h-16 w-auto object-contain opacity-80"
          />
          <p className="text-sm font-bold text-slate-400 tracking-widest uppercase">GrauConst</p>
          <p className="text-xs text-slate-600 tracking-widest uppercase">
            · Automação Industrial ·
          </p>
          <p className="text-xs text-slate-700 mt-1">Monitor IoT via ESP32 + Supabase</p>
        </div>
      </footer>
    </div>
  )
}
