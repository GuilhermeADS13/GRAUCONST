// ============================================================
//  SetupNeeded.jsx — Tela de configuração pendente.
// ============================================================

const LOGO_URL =
  'https://media.base44.com/images/public/69f39c8449a653fae9af2e44/174aed001_LOGO_GRAUCONST.png'

export function SetupNeeded() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-6">

        {/* Logo + título */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={LOGO_URL} alt="GrauConst" className="h-20 w-auto object-contain drop-shadow-lg" />
          <h1 className="text-2xl font-black text-white tracking-tight">GrauConst</h1>
          <p className="text-slate-400 text-sm">Automação Industrial · Monitor IoT</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <h2 className="text-lg font-black text-amber-300">Configuração pendente</h2>
          </div>

          <p className="text-slate-400 text-sm leading-relaxed">
            O dashboard não encontrou as credenciais do Supabase. Defina as variáveis abaixo no arquivo{' '}
            <code className="text-amber-300 bg-slate-800 px-1.5 py-0.5 rounded">.env</code>{' '}
            ou nas <em>Environment Variables</em> do Vercel.
          </p>

          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed">
            {`VITE_SUPABASE_URL=https://XXXXXXXX.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
          </pre>

          <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
            <li>
              Crie um projeto em{' '}
              <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">
                supabase.com
              </a>
            </li>
            <li>Em <strong className="text-slate-300">Settings → API</strong>, copie a <em>Project URL</em> e a <em>publishable key</em>.</li>
            <li>Cole no <code className="text-amber-300">.env</code> e reinicie o <code className="text-amber-300">npm run dev</code>.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
