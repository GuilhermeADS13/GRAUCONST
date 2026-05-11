import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fetchUltimoRegistro, fetchHistorico24h } from './lib/supabase'
import { StatCard } from './components/StatCard'
import { GraficoTemperatura } from './components/GraficoTemperatura'
import { LiveBadge } from './components/LiveBadge'

function formatDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function classificarTemp(t) {
  if (t === null) return { label: '—',             cor: 'blue'  }
  if (t < 18)     return { label: '❄️ Frio',        cor: 'blue'  }
  if (t < 25)     return { label: '✅ Confortável', cor: 'teal'  }
  if (t < 30)     return { label: '☀️ Quente',      cor: 'amber' }
  return               { label: '🔥 Muito quente', cor: 'red'   }
}

export default function App() {
  const [ultimo,      setUltimo]      = useState(null)
  const [historico,   setHistorico]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [realtime,    setRealtime]    = useState(false)
  const [novodado,    setNovoado]     = useState(false)
  const [erro,        setErro]        = useState(null)
  const channelRef = useRef(null)

  // ── Carrega dados ──────────────────────────────────────────
  const carregar = useCallback(async (spinner = false) => {
    if (spinner) setAtualizando(true)
    setErro(null)
    try {
      const [ult, hist] = await Promise.all([
        fetchUltimoRegistro(),
        fetchHistorico24h(),
      ])
      setUltimo(ult)
      setHistorico(hist)
    } catch (e) {
      setErro('Erro ao buscar dados. Verifique as variáveis de ambiente do Supabase.')
    } finally {
      setLoading(false)
      setAtualizando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // ── Realtime ───────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel('sensor_realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_leituras' },
        ({ new: novo }) => {
          setUltimo(novo)
          setHistorico(prev => {
            const corte = new Date(Date.now() - 24 * 60 * 60 * 1000)
            return [...prev.filter(d => new Date(d.created_at) > corte), novo]
          })
          setNovoado(true)
          setTimeout(() => setNovoado(false), 3000)
        }
      )
      .subscribe(status => setRealtime(status === 'SUBSCRIBED'))
    channelRef.current = ch
    return () => { supabase.removeChannel(ch); setRealtime(false) }
  }, [])

  const temp  = ultimo ? parseFloat(ultimo.temperatura) : null
  const tInfo = classificarTemp(temp)

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* HEADER */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌡️</span>
            <div>
              <h1 className="text-base font-black text-white leading-none tracking-tight">GRAUCONST</h1>
              <p className="text-xs text-slate-500 mt-0.5">Monitor IoT · ESP32 + DHT22</p>
            </div>
          </div>
          <LiveBadge realtime={realtime} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ERRO */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
            <span>⚠️</span>
            <p className="text-red-400 text-sm font-medium">{erro}</p>
          </div>
        )}

        {/* NOVO DADO */}
        {novoado && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 flex items-center gap-3">
            <span className="text-lg">📡</span>
            <p className="text-green-400 text-sm font-bold">Novo dado recebido via Realtime!</p>
          </div>
        )}

        {/* CARD TEMPERATURA */}
        <section>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Leitura atual</p>
          <StatCard
            icon="🌡️"
            label="Temperatura"
            value={loading ? null : temp?.toFixed(1)}
            unit="°C"
            status={tInfo.label}
            cor={tInfo.cor}
          />
        </section>

        {/* INFO SENSOR */}
        {!loading && ultimo && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Sensor</p>
              <p className="text-white font-semibold">{ultimo.sensor_id}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Última leitura</p>
              <p className="text-white font-semibold text-xs leading-relaxed">{formatDataHora(ultimo.created_at)}</p>
            </div>
          </div>
        )}

        {/* GRÁFICO */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              📈 Últimas 24 horas
            </h2>
            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-1 rounded-lg">
              {historico.length} registros
            </span>
          </div>
          <GraficoTemperatura dados={historico} loading={loading} />
        </section>

        {/* BOTÃO ATUALIZAR */}
        <div className="flex justify-center pb-4">
          <button
            onClick={() => carregar(true)}
            disabled={atualizando}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold px-10 py-3 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/30"
          >
            {atualizando
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Atualizando...</span></>
              : <><span>🔄</span><span>Atualizar Agora</span></>
            }
          </button>
        </div>

      </main>

      <footer className="text-center py-4 text-xs text-slate-700 border-t border-slate-900">
        GRAUCONST · IoT Monitor via ESP32 + Supabase
      </footer>
    </div>
  )
}
