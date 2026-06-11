import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchUltimoRegistro, fetchHistorico, isSupabaseConfigured } from './lib/supabase'
import {
  formatDataHora,
  nomeSensor,
  classificarTemp,
  classificarUmidade,
  classificarBateria,
  classificarWifi,
} from './utils'
import { StatCard } from './components/StatCard'
import { LiveBadge } from './components/LiveBadge'
import { SetupNeeded } from './components/SetupNeeded'
import { SeletorPeriodo } from './components/SeletorPeriodo'

// Recharts é carregado só quando o gráfico aparece na tela (code-splitting).
const GraficoTemperatura = lazy(() =>
  import('./components/GraficoTemperatura').then((m) => ({ default: m.GraficoTemperatura }))
)

const LOGO_URL =
  'https://media.base44.com/images/public/69f39c8449a653fae9af2e44/174aed001_LOGO_GRAUCONST.png'

const PERIODOS = {
  '1h': { ms: 60 * 60 * 1000, tituloKey: 'chart.lastHour', formatoEixo: 'hora' },
  '24h': { ms: 24 * 60 * 60 * 1000, tituloKey: 'chart.last24h', formatoEixo: 'hora' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, tituloKey: 'chart.last7d', formatoEixo: 'data' },
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, tituloKey: 'chart.last30d', formatoEixo: 'data' },
}
const OPCOES_PERIODO = Object.keys(PERIODOS).map((chave) => ({ chave, label: chave }))

// Intervalo de envio do ESP32 (deep sleep) — usado para estimar a próxima leitura.
const INTERVALO_ENVIO_MS = 15 * 60 * 1000

// ── App ──────────────────────────────────────────────────────
export default function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />
  return <Dashboard />
}

// ── LanguageToggle ───────────────────────────────────────────
function LanguageToggle() {
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en'

  function toggle() {
    i18n.changeLanguage(lang === 'pt-BR' ? 'en' : 'pt-BR')
  }

  return (
    <button
      onClick={toggle}
      title="Change language / Mudar idioma"
      className="text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
    >
      {lang === 'pt-BR' ? 'EN' : 'PT'}
    </button>
  )
}

// ── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  const { t } = useTranslation()

  const [ultimo, setUltimo] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [realtime, setRealtime] = useState(false)
  const [novoDado, setNovoDado] = useState(false)
  const [erro, setErro] = useState(null)
  const [periodo, setPeriodo] = useState('24h')
  const [agora, setAgora] = useState(() => Date.now())

  const periodoConfig = PERIODOS[periodo]

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
        setErro(e?.message || t('notification.newData'))
      } finally {
        setLoading(false)
        setAtualizando(false)
      }
    },
    [periodoConfig.ms, t]
  )

  useEffect(() => {
    setLoading(true)
    carregar()
  }, [carregar])

  useEffect(() => {
    const ch = supabase
      .channel(`sensor_realtime_${periodo}`)
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
  }, [periodo, periodoConfig.ms])

  // Relógio leve: atualiza "há X min" / "próxima em ~Y min" sem refazer fetch.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const bat = ultimo && ultimo.bateria_pct != null ? parseInt(ultimo.bateria_pct) : null
  const rssi = ultimo && ultimo.rssi != null ? ultimo.rssi : null

  // Inkbird
  const iTemp = ultimo && ultimo.inkbird_temp != null ? parseFloat(ultimo.inkbird_temp) : null
  const iUmid = ultimo && ultimo.inkbird_hum != null ? parseFloat(ultimo.inkbird_hum) : null
  const iBat = ultimo && ultimo.inkbird_bat != null ? parseInt(ultimo.inkbird_bat) : null

  const bInfo = classificarBateria(bat)
  const wInfo = classificarWifi(rssi)

  const itInfo = classificarTemp(iTemp)
  const iuInfo = classificarUmidade(iUmid)
  const ibInfo = classificarBateria(iBat)

  // Tempo desde a última leitura e estimativa da próxima (ciclo de deep sleep).
  const ultimaMs = ultimo?.created_at ? new Date(ultimo.created_at).getTime() : null
  const desdeMin = ultimaMs != null ? Math.max(0, Math.floor((agora - ultimaMs) / 60000)) : null
  const proximaMin = ultimaMs != null ? Math.ceil((ultimaMs + INTERVALO_ENVIO_MS - agora) / 60000) : null

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-10 shadow-xl shadow-black/30">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={LOGO_URL}
              alt="GrauConst"
              className="h-16 w-auto object-contain drop-shadow-lg"
            />
            <div className="flex flex-col">
              <h1 className="text-xl font-black text-white leading-none tracking-tight">
                GrauConst
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-semibold tracking-[0.15em] uppercase">
                Automação Industrial
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <LiveBadge realtime={realtime} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* ── ERRO ──────────────────────────────────────────── */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
            <span>⚠️</span>
            <p className="text-red-400 text-sm font-medium">{erro}</p>
          </div>
        )}

        {/* ── NOVO DADO ─────────────────────────────────────── */}
        {novoDado && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 flex items-center gap-3">
            <span className="text-lg">📡</span>
            <p className="text-green-400 text-sm font-bold">{t('notification.newData')}</p>
          </div>
        )}

        {/* ── CARDS INKBIRD ──────────────────────────────────── */}
        {iTemp != null && (
          <section>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              {t('inkbird.section')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                icon="🌡️"
                label={t('inkbird.temperature')}
                value={iTemp?.toFixed(1)}
                unit="°C"
                status={t(itInfo.labelKey)}
                cor={itInfo.cor}
              />
              <StatCard
                icon="💧"
                label={t('inkbird.humidity')}
                value={iUmid?.toFixed(1)}
                unit="%"
                status={t(iuInfo.labelKey)}
                cor={iuInfo.cor}
              />
              <div className="col-span-2">
                <StatCard
                  icon="🔋"
                  label={t('inkbird.battery')}
                  value={iBat}
                  unit="%"
                  status={t(ibInfo.labelKey)}
                  cor={ibInfo.cor}
                />
              </div>
            </div>
          </section>
        )}

        {/* ── CARDS DISPOSITIVO ─────────────────────────────── */}
        <section>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            {t('device.section')}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon="🔋"
              label={t('device.battery')}
              value={loading ? null : bat != null ? bat : '—'}
              unit={bat != null ? '%' : ''}
              status={t(bInfo.labelKey)}
              cor={bInfo.cor}
            />
            <StatCard
              icon="📶"
              label={t('device.wifi')}
              value={loading ? null : rssi != null ? rssi : '—'}
              unit={rssi != null ? 'dBm' : ''}
              status={t(wInfo.labelKey)}
              cor={wInfo.cor}
            />
          </div>
        </section>

        {/* ── INFO SENSOR ───────────────────────────────────── */}
        {!loading && ultimo && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">
                {t('info.sensorId')}
              </p>
              <p className="text-white font-semibold text-xs">{nomeSensor(ultimo.sensor_id)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">
                {t('info.lastReading')}
              </p>
              <p className="text-white font-semibold text-xs leading-relaxed">
                {formatDataHora(ultimo.created_at)}
              </p>
            </div>
          </div>
        )}

        {/* ── GRÁFICO ───────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              📈 {t(periodoConfig.tituloKey)}
            </h2>
            <SeletorPeriodo valor={periodo} onChange={setPeriodo} opcoes={OPCOES_PERIODO} />
          </div>
          <div className="flex justify-end mb-4">
            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-1 rounded-lg">
              {t('chart.records', { count: historico.length })}
            </span>
          </div>
          <Suspense
            fallback={
              <div className="h-64 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <GraficoTemperatura
              dados={historico}
              loading={loading}
              formatoEixo={periodoConfig.formatoEixo}
            />
          </Suspense>
        </section>

        {/* ── STATUS DE ATUALIZAÇÃO ─────────────────────────── */}
        <div className="flex flex-col items-center gap-2 pb-4">
          <button
            onClick={() => carregar(true)}
            disabled={atualizando}
            title={t('update.hint')}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 font-semibold px-6 py-2.5 rounded-2xl transition-all duration-200 active:scale-95 border border-slate-700/80"
          >
            {atualizando ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                <span>{t('update.syncing')}</span>
              </>
            ) : (
              <>
                <span>🕐</span>
                <span>
                  {desdeMin == null
                    ? '—'
                    : desdeMin < 1
                      ? t('update.lastNow')
                      : t('update.lastAgo', { count: desdeMin })}
                </span>
              </>
            )}
          </button>
          {!atualizando && proximaMin != null && (
            <p className="text-xs text-slate-500">
              {proximaMin <= 0 ? t('update.nextSoon') : t('update.next', { count: proximaMin })}
            </p>
          )}
        </div>
      </main>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/50 py-8 mt-4">
        <div className="flex flex-col items-center gap-3">
          <img
            src={LOGO_URL}
            alt="GrauConst"
            className="h-16 w-auto object-contain drop-shadow-lg opacity-90"
          />
          <p className="text-base font-black text-slate-300 tracking-tight">GrauConst</p>
          <p className="text-xs text-slate-500 font-semibold tracking-[0.15em] uppercase">
            Automação Industrial
          </p>
          <p className="text-xs text-slate-700 mt-1 tracking-wide">
            Monitor IoT · ESP32 + Supabase
          </p>
        </div>
      </footer>
    </div>
  )
}
