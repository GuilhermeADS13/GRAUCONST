// ============================================================
//  SeletorSensor.jsx — Dropdown para escolher qual sensor monitorar.
//
//  Props:
//    valor    → sensor_id ativo.
//    onChange → callback chamado com o novo sensor_id.
//    sensores → array { sensor_id, ultima_leitura } do supabase.js.
//
//  Comportamento:
//    - Esconde-se se houver 0 ou 1 sensor (sem ambiguidade).
//    - Mostra o sensor_id completo no <option>.
//    - Usa <select> nativo (acessibilidade, sem libs extras).
// ============================================================

export function SeletorSensor({ valor, onChange, sensores }) {
  if (!sensores || sensores.length <= 1) return null

  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="font-bold uppercase tracking-wider">Sensor</span>
      <select
        value={valor || ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
      >
        {sensores.map((s) => (
          <option key={s.sensor_id} value={s.sensor_id}>
            {s.sensor_id}
          </option>
        ))}
      </select>
    </label>
  )
}
