// ============================================================
//  SeletorPeriodo.jsx — Pílulas para escolher janela de tempo.
//
//  Props:
//    valor    → chave do período ativo ('1h' | '24h' | '7d' | '30d').
//    onChange → callback chamado com a nova chave.
//    opcoes   → array de { chave, label } com os períodos disponíveis.
//
//  Visual: linha horizontal de botões "pill", destaque azul no ativo.
//  Para adicionar/remover período: edite PERIODOS em App.jsx.
// ============================================================

export function SeletorPeriodo({ valor, onChange, opcoes }) {
  return (
    <div className="inline-flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
      {opcoes.map((op) => {
        const ativo = op.chave === valor
        return (
          <button
            key={op.chave}
            onClick={() => onChange(op.chave)}
            className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${
              ativo
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {op.label}
          </button>
        )
      })}
    </div>
  )
}
