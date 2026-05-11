// ============================================================
//  SetupNeeded.jsx — Tela exibida quando faltam credenciais Supabase.
//
//  Renderizada pelo App.jsx quando `isSupabaseConfigured === false`,
//  ou seja, quando VITE_SUPABASE_URL ou VITE_SUPABASE_ANON não estão
//  definidos no .env (dev) ou nas Environment Variables (Vercel).
//
//  Mostra um passo-a-passo curto para o usuário pegar as credenciais.
//  Sem props — auto-contido.
// ============================================================

export function SetupNeeded() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⚙️</span>
          <h1 className="text-xl font-black">Configuração pendente</h1>
        </div>

        <p className="text-slate-400 text-sm leading-relaxed">
          O dashboard não encontrou as credenciais do Supabase. Defina as variáveis abaixo no
          arquivo <code className="text-amber-300 bg-slate-800 px-1.5 py-0.5 rounded">.env</code>{' '}
          (desenvolvimento) ou nas <em>Environment Variables</em> do Vercel (produção).
        </p>

        <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto">
          {`VITE_SUPABASE_URL=https://XXXXXXXX.supabase.co
VITE_SUPABASE_ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
        </pre>

        <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
          <li>
            Crie um projeto em{' '}
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 underline"
            >
              supabase.com
            </a>
          </li>
          <li>
            Em <strong>Settings → API</strong>, copie a <em>Project URL</em> e a{' '}
            <em>anon key</em>.
          </li>
          <li>
            Cole no <code className="text-amber-300">.env</code> e reinicie o{' '}
            <code className="text-amber-300">npm run dev</code>.
          </li>
        </ol>
      </div>
    </div>
  )
}

