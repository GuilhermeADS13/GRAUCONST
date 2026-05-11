import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fetchUltimoRegistro, fetchHistorico24h } from './lib/supabase'
import { StatCard } from './components/StatCard'
import { GraficoTemperatura } from './components/GraficoTemperatura'
import { LiveBadge } from './components/LiveBadge'

function formatDataHora(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function classificarTemp(temp) {
  if (temp === null) return { label: '—', cor: 'blue' }
  if (temp < 18)  return { label: 'Frio', cor: 'blue' }
  if (temp < 25)  return { label: 'Confortável', cor: 'teal' }
  if (temp < 30)  return { label: 'Quente', cor: 'amber' }
  return { label: 'Muito quente', cor: 'red' }
}

function classificarUmid(umid) {
  if (umid === null) return { label: '—', cor: 'teal' }
  if (umid < 30) return { label: 'Muito seco', cor: 'amber' }
  if (umid < 50) return { label: 'Seco', cor: 'teal' }
  if (umid < 70) return { label: 'Ideal', cor: 'teal' }
  return { label: 'Úmido', cor: 'blue' }
}

export default function App() {
  const [ultimo,         setUltimo]         = useState(null)
  const [historico,      setHistorico]       = useState([])
  const [loadingInicial, setLoadingInicial]  = useState(true)
  const [loadingAtualizando, setLoadingAtualizando] = useState(false)
  const [realtimeAtivo,  setRealtimeAtivo]   = useState(false)
  const [erro,           setErro]            = useState(null)
  const [novoRegistro,   setNovoRegistro]    = useState(false)
  const channelRef = useRef(null)

  // ── Carrega dados iniciais ───────────────────────────────
  const carregarDados = useCallback(async (mostrarSpinner = false) => {
    if (mostrarSpinner) setLoadingAtualizando(true)
    setErro(null)
    try {
      const [ult, hist] = await Promise.all([
        fetchUltimoRegistro(),
        fetchHistorico24h(),
      ])
      setUltimo(ult)
      setHistorico(hist)
    } catch (e) {
      console.error(e)
      setErro('Erro ao buscar dados. Verifique a conexão com o Supabase.')
    } finally {
      setLoadingInicial(false)
      setLoadingAtualizando(false)
    }
  }, [])

  // ── Carga inicial ────────────────────────────────────────
  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // ── Supabase Realtime ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('sensor_leituras_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_leituras' },
        (payload) => {
          console.log('[Realtime] Novo registro:', payload.new)
          const novo = payload.new

          // Atualiza o card "Último Registro"
          setUltimo(novo)

          // Adiciona ao histórico (mantém janela de 24h)
          setHistorico(prev => {
            const corte = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const filtrado = prev.filter(d => new Date(d.created_at) > corte)
            return [...filtrado, novo]
          })

          // Animação de novo registro
          setNovoRegistro(true)
          setTimeout(() => setNovoRegistro(false), 2500)
        }
      )
      .subscribe((status) => {
        setRealtimeAtivo(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      setRealtimeAtivo(false)
    }
  }, [])

  const temp  = ultimo ? parseFloat(ultimo.temperatura) : null
  const umid  = ultimo ? parseFloat(ultimo.umidade)     : null
  const tInfo = classificarTemp(temp)
  const uInfo = classificarUmid(umid)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── HEADER ──────────────────────────────────────── */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌡️</span>
            <div>
              <h1 className="text-lg font-black text-white leading-none">GRAUCONST</h1>
              <p className="text-xs text-slate-400 mt-0.5">Monitor Ambiental · Sensor DHT22</p>
            </div>
          </div>
          <LiveBadge realtime={realtimeAtivo} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── ERRO ────────────────────────────────────────── */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-red-400 text-sm font-medium">{erro}</p>
          </div>
        )}

        {/* ── NOVO DADO RECEBIDO ───────────────────────────── */}
        {novoRegistro && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 flex items-center gap-3 animate-pulse">
            <span className="text-lg">📡</span>
            <p className="text-green-400 text-sm font-semibold">Novo dado recebido via Realtime!</p>
          </div>
        )}

        {/* ── CARDS TEMPERATURA E UMIDADE ─────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Leitura Atual</h2>
            {!loadingInicial && (
              <span className="text-xs text-slate-500">
                {ultimo ? `Atualizado às ${new Date(ultimo.created_at).toLocaleTimeString('pt-BR')}` : 'Sem dados'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon="🌡️"
              label="Temperatura"
              value={loadingInicial ? null : temp?.toFixed(1)}
              unit="°C"
              status={tInfo.label}
              cor={tInfo.cor}
            />
            <StatCard
              icon="💧"
              label="Umidade"
              value={loadingInicial ? null : umid?.toFixed(1)}
              unit="%"
              status={uInfo.label}
              cor={uInfo.cor}
            />
          </div>
        </section>

        {/* ── INFO SENSOR ─────────────────────────────────── */}
        {!loadingInicial && ultimo && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Sensor</p>
              <p className="text-white font-semibold">{ultimo.sensor_id || 'DHT22-01'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Última leitura</p>
              <p className="text-white font-semibold text-xs">{formatDataHora(ultimo.created_at)}</p>
            </div>
          </div>
        )}

        {/* ── GRÁFICO 24H ─────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              📈 Variação nas últimas 24h
            </h2>
            <span className="text-xs text-slate-500">{historico.length} registros</span>
          </div>
          <GraficoTemperatura dados={historico} loading={loadingInicial} />
        </section>

        {/* ── BOTÃO ATUALIZAR ─────────────────────────────── */}
        <div className="flex justify-center pb-6">
          <button
            onClick={() => carregarDados(true)}
            disabled={loadingAtualizando}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/40"
          >
            {loadingAtualizando ? (
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

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="text-center py-4 text-xs text-slate-600 border-t border-slate-900">
        GRAUCONST · Monitoramento Ambiental via ESP32 + Supabase
      </footer>
    </div>
  )
}
