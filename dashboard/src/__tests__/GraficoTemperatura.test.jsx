import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraficoTemperatura } from '../components/GraficoTemperatura'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  defs: () => null,
  linearGradient: () => null,
  stop: () => null,
}))

const dadosExemplo = [
  { id: 1, created_at: '2025-01-15T10:00:00Z', temperatura: 22.5 },
  { id: 2, created_at: '2025-01-15T10:15:00Z', temperatura: 23.1 },
  { id: 3, created_at: '2025-01-15T10:30:00Z', temperatura: 21.8 },
]

describe('GraficoTemperatura', () => {
  it('exibe spinner enquanto loading=true', () => {
    const { container } = render(<GraficoTemperatura dados={[]} loading={true} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('exibe mensagem quando não há dados', () => {
    render(<GraficoTemperatura dados={[]} loading={false} />)
    expect(screen.getByText('chart.empty')).toBeInTheDocument()
  })

  it('renderiza gráfico com dados válidos', () => {
    render(<GraficoTemperatura dados={dadosExemplo} loading={false} />)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('exibe média, min e max quando há dados', () => {
    const { container } = render(<GraficoTemperatura dados={dadosExemplo} loading={false} />)
    expect(container.textContent).toContain('chart.avg')
    expect(container.textContent).toContain('chart.min')
    expect(container.textContent).toContain('chart.max')
  })
})
