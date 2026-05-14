import { vi } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts?.count !== undefined ? `${key}:${opts.count}` : key),
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))
