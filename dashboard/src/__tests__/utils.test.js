import { describe, it, expect } from 'vitest'
import {
  classificarTemp,
  classificarUmidade,
  classificarBateria,
  classificarWifi,
  formatDataHora,
} from '../utils'

describe('classificarTemp', () => {
  it('null → blue / unknown', () => {
    expect(classificarTemp(null)).toEqual({ labelKey: 'status.unknown', cor: 'blue' })
  })
  it('< 18 → cold / blue', () => {
    expect(classificarTemp(10)).toEqual({ labelKey: 'status.cold', cor: 'blue' })
    expect(classificarTemp(17.9)).toEqual({ labelKey: 'status.cold', cor: 'blue' })
  })
  it('18–24 → comfortable / teal', () => {
    expect(classificarTemp(18)).toEqual({ labelKey: 'status.comfortable', cor: 'teal' })
    expect(classificarTemp(22)).toEqual({ labelKey: 'status.comfortable', cor: 'teal' })
  })
  it('25–29 → warm / amber', () => {
    expect(classificarTemp(25)).toEqual({ labelKey: 'status.warm', cor: 'amber' })
    expect(classificarTemp(29.9)).toEqual({ labelKey: 'status.warm', cor: 'amber' })
  })
  it('>= 30 → hot / red', () => {
    expect(classificarTemp(30)).toEqual({ labelKey: 'status.hot', cor: 'red' })
    expect(classificarTemp(45)).toEqual({ labelKey: 'status.hot', cor: 'red' })
  })
})

describe('classificarUmidade', () => {
  it('null → blue / unknown', () => {
    expect(classificarUmidade(null)).toEqual({ labelKey: 'status.unknown', cor: 'blue' })
  })
  it('< 30 → dry / amber', () => {
    expect(classificarUmidade(0)).toEqual({ labelKey: 'status.dry', cor: 'amber' })
    expect(classificarUmidade(29)).toEqual({ labelKey: 'status.dry', cor: 'amber' })
  })
  it('30–59 → comfortable / teal', () => {
    expect(classificarUmidade(30)).toEqual({ labelKey: 'status.comfortable', cor: 'teal' })
    expect(classificarUmidade(50)).toEqual({ labelKey: 'status.comfortable', cor: 'teal' })
  })
  it('>= 60 → humid / blue', () => {
    expect(classificarUmidade(60)).toEqual({ labelKey: 'status.humid', cor: 'blue' })
    expect(classificarUmidade(90)).toEqual({ labelKey: 'status.humid', cor: 'blue' })
  })
})

describe('classificarBateria', () => {
  it('null → blue / unknown', () => {
    expect(classificarBateria(null)).toEqual({ labelKey: 'status.unknown', cor: 'blue' })
  })
  it('>= 60 → full / teal', () => {
    expect(classificarBateria(60)).toEqual({ labelKey: 'status.batteryFull', cor: 'teal' })
    expect(classificarBateria(100)).toEqual({ labelKey: 'status.batteryFull', cor: 'teal' })
  })
  it('30–59 → medium / amber', () => {
    expect(classificarBateria(30)).toEqual({ labelKey: 'status.batteryMedium', cor: 'amber' })
    expect(classificarBateria(59)).toEqual({ labelKey: 'status.batteryMedium', cor: 'amber' })
  })
  it('< 30 → low / red', () => {
    expect(classificarBateria(0)).toEqual({ labelKey: 'status.batteryLow', cor: 'red' })
    expect(classificarBateria(29)).toEqual({ labelKey: 'status.batteryLow', cor: 'red' })
  })
})

describe('classificarWifi', () => {
  it('null → blue / unknown', () => {
    expect(classificarWifi(null)).toEqual({ labelKey: 'status.unknown', cor: 'blue' })
  })
  it('>= -50 → excellent / teal', () => {
    expect(classificarWifi(-30)).toEqual({ labelKey: 'status.wifiExcellent', cor: 'teal' })
    expect(classificarWifi(-50)).toEqual({ labelKey: 'status.wifiExcellent', cor: 'teal' })
  })
  it('-51 to -65 → good / teal', () => {
    expect(classificarWifi(-51)).toEqual({ labelKey: 'status.wifiGood', cor: 'teal' })
    expect(classificarWifi(-65)).toEqual({ labelKey: 'status.wifiGood', cor: 'teal' })
  })
  it('-66 to -75 → fair / amber', () => {
    expect(classificarWifi(-66)).toEqual({ labelKey: 'status.wifiFair', cor: 'amber' })
    expect(classificarWifi(-75)).toEqual({ labelKey: 'status.wifiFair', cor: 'amber' })
  })
  it('-76 to -85 → weak / amber', () => {
    expect(classificarWifi(-76)).toEqual({ labelKey: 'status.wifiWeak', cor: 'amber' })
    expect(classificarWifi(-85)).toEqual({ labelKey: 'status.wifiWeak', cor: 'amber' })
  })
  it('< -85 → very weak / red', () => {
    expect(classificarWifi(-86)).toEqual({ labelKey: 'status.wifiVeryWeak', cor: 'red' })
    expect(classificarWifi(-120)).toEqual({ labelKey: 'status.wifiVeryWeak', cor: 'red' })
  })
})

describe('formatDataHora', () => {
  it('retorna — para null', () => {
    expect(formatDataHora(null)).toBe('—')
    expect(formatDataHora(undefined)).toBe('—')
  })
  it('retorna string não vazia para ISO válido', () => {
    const result = formatDataHora('2025-01-15T10:30:00Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
