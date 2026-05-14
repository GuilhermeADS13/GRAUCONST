import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from '../components/StatCard'

describe('StatCard', () => {
  it('renderiza label e valor', () => {
    render(
      <StatCard
        icon="🌡️"
        label="Temperatura"
        value="24.5"
        unit="°C"
        status="✅ Confortável"
        cor="teal"
      />
    )
    expect(screen.getByText('Temperatura')).toBeInTheDocument()
    expect(screen.getByText('24.5')).toBeInTheDocument()
    expect(screen.getByText('°C')).toBeInTheDocument()
  })

  it('exibe skeleton quando value é null', () => {
    const { container } = render(
      <StatCard icon="🌡️" label="Temperatura" value={null} unit="°C" status="—" cor="blue" />
    )
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(screen.queryByText('°C')).not.toBeInTheDocument()
  })

  it('aplica classe teal quando cor=teal', () => {
    const { container } = render(
      <StatCard icon="💧" label="Umidade" value="55" unit="%" status="✅ Confortável" cor="teal" />
    )
    expect(container.firstChild.className).toMatch(/teal/)
  })

  it('aplica classe red quando cor=red', () => {
    const { container } = render(
      <StatCard icon="🔥" label="Temp" value="35" unit="°C" status="hot" cor="red" />
    )
    expect(container.firstChild.className).toMatch(/red/)
  })

  it('usa azul como fallback para cor inválida', () => {
    const { container } = render(
      <StatCard icon="?" label="X" value="1" unit="" status="?" cor="invalid" />
    )
    expect(container.firstChild.className).toMatch(/blue/)
  })
})
