// ============================================================
//  SeletorPeriodo.jsx — Pílulas para escolher janela de tempo.
// ============================================================

export function SeletorPeriodo({ valor, onChange, opcoes }) {
  return (
    <div className="inline-flex bg-slate-800/80 border border-slate-700/50 rounded-xl p-1 gap-0.5">
      {opcoes.map((op) => {
        const ativo = op.chave === valor
        return (
          <button
            key={op.chave}
            onClick={() => onChange(op.chave)}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all duration-200 ${
              ativo
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/70'
            }`}
          >
            {op.label}
          </button>
        )
      })}
    </div>
  )
}
