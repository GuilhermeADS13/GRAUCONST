// ============================================================
//  main.jsx — Ponto de entrada da aplicação React.
//  Monta o componente <App /> dentro da <div id="root"> do index.html.
//  StrictMode ajuda a detectar problemas em desenvolvimento (renderiza
//  componentes duas vezes para encontrar efeitos colaterais).
// ============================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './i18n/index.js'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
