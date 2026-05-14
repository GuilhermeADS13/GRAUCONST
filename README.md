<div align="center">

# GRAUCONST

**Monitoramento IoT de temperatura e umidade em tempo real**

Sistema completo de ponta a ponta: do sensor físico (ESP32 + DHT22) até o dashboard web,
com sincronização em tempo real via Supabase Realtime.

[![CI](https://github.com/GuilhermeADS13/GRAUCONST/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilhermeADS13/GRAUCONST/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Visão geral

O GRAUCONST coleta, armazena e exibe leituras ambientais em ciclos de 15 minutos.
Um microcontrolador ESP32 alimentado por bateria lê o sensor DHT22, envia os dados
via HTTPS para o Supabase e entra em *deep sleep* para economia de energia. O
dashboard React recebe atualizações instantâneas via WebSocket, sem necessidade
de refresh.

### Por que este projeto

- **Custo baixo**: ESP32 (~R$ 35) + DHT22 (~R$ 20) + Supabase Free + Vercel Free.
- **Energia mínima**: deep sleep entre leituras estende a vida da bateria por semanas.
- **Tempo real**: Supabase Realtime entrega novos dados em < 1s sem polling.
- **Histórico**: até 24h de variação no gráfico, com média, mínima e máxima.

---

## Arquitetura

```
┌─────────────┐    HTTPS POST    ┌──────────────────┐    Realtime (WS)    ┌──────────────┐
│   ESP32     │ ───────────────▶ │     Supabase     │ ──────────────────▶ │  Dashboard   │
│   DHT22     │   a cada 15min   │  PostgreSQL +    │   INSERT events     │  React/Vite  │
│  (sleep)    │                  │   Realtime + RLS │                     │   (Vercel)   │
└─────────────┘                  └──────────────────┘                     └──────────────┘
```

### Stack

| Camada           | Tecnologia                                           |
|------------------|------------------------------------------------------|
| Hardware         | ESP32, sensor DHT22                                  |
| Firmware         | Arduino C++, DHT sensor library, ArduinoJson         |
| Backend          | Supabase (PostgreSQL 15 + Realtime + RLS)            |
| Frontend         | React 18, Vite 5, Tailwind CSS 3, Recharts           |
| Deploy           | Vercel (frontend), Supabase (backend gerenciado)     |
| CI               | GitHub Actions (ESLint + Prettier + build)           |

---

## Estrutura do repositório

```
GRAUCONST/
├── .github/workflows/ci.yml         CI: lint + format-check + build
├── .mcp.json                        Config do Supabase MCP server (Claude Code)
├── sql_setup.sql                    Schema do banco (tabela, RLS, Realtime, pg_cron)
├── seed.sql                         Dados de exemplo (opcional, só dev)
├── supabase/functions/
│   └── sensor-ingest/index.ts       Edge Function gateway de INSERT (service_role)
├── esp32/
│   ├── grauconst_esp32.ino          Firmware (deep sleep 15min)
│   └── secrets.h.example            Template de credenciais (copiar para secrets.h)
└── dashboard/
    ├── .env.example                 Template de variáveis Vite
    ├── vercel.json                  Config de deploy (rewrites SPA)
    └── src/
        ├── App.jsx                  Componente raiz + Realtime + estado
        ├── lib/supabase.js          Cliente e queries
        └── components/
            ├── StatCard.jsx             Card de leitura (temp / umidade)
            ├── GraficoTemperatura.jsx   Área chart com média/min/max
            ├── SeletorPeriodo.jsx       Pílulas de filtro 1h/24h/7d/30d
            ├── LiveBadge.jsx            Indicador de status Realtime
            └── SetupNeeded.jsx          Tela exibida quando env vars faltam
```

---

## Setup rápido

### 1. Backend (Supabase) — 30 segundos

> **Por que preciso fazer isso?** O Supabase é o seu banco de dados. Apenas o
> dono do projeto tem privilégios para criar tabelas (DDL). Não há como
> automatizar de fora — é literalmente 1 cópia + 1 clique em **Run**.

1. **Crie um projeto** em [database.new](https://database.new) (atalho oficial do
   Supabase, abre direto a tela de criação).
2. No painel do projeto, clique em **SQL Editor** (ícone `</>` na barra lateral).
3. Cole o conteúdo de [sql_setup.sql](sql_setup.sql) e clique em **Run**
   (ou pressione `Ctrl/Cmd + Enter`). Pronto — tabela, índices, RLS e Realtime
   configurados.
4. *(Opcional)* Cole [seed.sql](seed.sql) e clique **Run** para popular o
   gráfico com dados de exemplo enquanto o ESP32 ainda não está enviando.
5. Em **Settings → API**, copie:
   - `Project URL`
   - `anon` / `publishable` key (a chave pública — começa com `eyJ...` no formato
     legado JWT ou com `sb_publishable_...` no formato novo)

> 💡 **Trabalhando com IA?** O repositório inclui um [`.mcp.json`](.mcp.json) que
> expõe o Supabase MCP server para o Claude Code. Rode `/mcp` no terminal para
> autenticar via OAuth — depois o assistente pode rodar SQL, ler tabelas e
> aplicar migrações diretamente no projeto, sem você precisar abrir o SQL Editor.

### 2. Frontend (local)

```bash
cd dashboard
npm install
cp .env.example .env       # depois preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                # abre em http://localhost:5173
```

Se o `.env` estiver faltando ou incompleto, o dashboard mostra a tela
**Configuração pendente** com instruções — não quebra.

### 3. Deploy (Vercel)

1. [vercel.com](https://vercel.com) → **Import Project** → escolha o repositório.
2. **Root Directory:** `dashboard`
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. **Deploy.** A cada push em `main`, Vercel redeploya automaticamente.

### 4. Edge Function — DEVICE_TOKEN (uma vez)

A RLS bloqueia INSERT direto. Os ESP32s mandam dados via Edge Function
`sensor-ingest`, autenticada por um **device token compartilhado**.

1. Gere um token forte:
   ```bash
   # Linux / macOS / Git Bash
   openssl rand -hex 32

   # Windows PowerShell
   -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
   ```
2. Abra: `https://supabase.com/dashboard/project/<ref>/settings/functions`
3. Vá em **Edge Function Secrets** → **Add new secret**.
4. Nome: `DEVICE_TOKEN`. Valor: o token gerado.
5. Salvar. A Edge Function passa a aceitar requests com `X-Device-Token` correspondendo.
6. Use o **mesmo token** no `esp32/secrets.h` (`#define DEVICE_TOKEN "..."`).

### 5. Firmware (ESP32)

1. Na Arduino IDE, instale:
   - **DHT sensor library** (Adafruit)
   - **ArduinoJson**
2. Copie `esp32/secrets.h.example` para `esp32/secrets.h` e preencha SSID, senha,
   `SUPABASE_URL` e `DEVICE_TOKEN` (mesmo valor do passo 4).
3. Conecte o DHT22 ao GPIO 4 (alterável em `DHT_PIN`).
4. Abra `esp32/grauconst_esp32.ino` e dê *Upload*.

---

## Scripts disponíveis

Dentro de `dashboard/`:

| Comando                | O que faz                                      |
|------------------------|------------------------------------------------|
| `npm run dev`          | Servidor de desenvolvimento (HMR)              |
| `npm run build`        | Build de produção para `dist/`                 |
| `npm run preview`      | Preview do build                               |
| `npm run lint`         | ESLint (falha com qualquer warning)            |
| `npm run format`       | Aplica Prettier                                |
| `npm run format:check` | Verifica formatação sem alterar (usado no CI)  |

---

## Modelo de dados

```sql
sensor_leituras
├── id            BIGSERIAL      PK
├── sensor_id     TEXT           ESP32-<MAC sem ":">; default 'DHT22-01' para compat
├── temperatura   NUMERIC(5,2)   CHECK BETWEEN -40 AND 80
├── umidade       NUMERIC(5,2)   CHECK BETWEEN 0 AND 100 (nullable)
├── bateria_pct   SMALLINT       CHECK BETWEEN 0 AND 100 (nullable, % LiPo)
├── rssi          INT            CHECK BETWEEN -120 AND 0 (nullable, em dBm)
└── created_at    TIMESTAMPTZ    default NOW()
```

**Row Level Security** ativa:
- `SELECT`: público (qualquer um lê — necessário para o dashboard sem auth)
- `INSERT`: via *anon key* (necessário para o ESP32). **Limitação conhecida**:
  qualquer pessoa com a chave pública pode inserir dados. Roadmap inclui
  endurecimento via Edge Function intermediária ou JWT (ver Roadmap abaixo).

---

## Status do projeto

### ✅ Implementado

- Leitura de temperatura e umidade no ESP32 com deep sleep de 15 min
- Envio HTTPS para Supabase via REST
- Schema com `CHECK` de domínio e índices por tempo e sensor
- Row Level Security configurada
- Dashboard React com cards de temperatura e umidade
- Gráfico de área (média / mín / máx) com **filtros de período: 1h / 24h / 7d / 30d**
- Supabase Realtime (atualização sem refresh)
- Indicador visual de status do Realtime
- Tela de "Configuração pendente" quando faltam env vars
- ESLint + Prettier + GitHub Actions CI
- Multi-sensor (sensor_id baseado em MAC do ESP32) + dropdown automático
- Telemetria de bateria (V) e RSSI (dBm) com indicador de barras de sinal
- **RLS endurecida**: INSERT só via Edge Function `sensor-ingest` autenticada por
  `X-Device-Token`. Anon key não consegue mais inserir (testado).
- **Retenção automática 90 dias** via `pg_cron` (job `prune_sensor_leituras_90d`)

### 🛣️ Roadmap

Itens priorizados para próximas iterações. Pull requests bem-vindos.

#### Próxima fase — UX

- [x] **Multi-sensor**: ESP32 identifica-se pelo MAC (`ESP32-AABBCCDDEEFF`); dashboard
      tem dropdown que aparece quando há mais de 1 sensor enviando dados.
- [ ] **Export de dados**: download CSV/JSON do histórico filtrado
- [ ] **Alertas por threshold**: notificação visual quando temp/umidade saem da faixa
- [ ] **Tema claro / escuro** com toggle

#### Próxima fase — Robustez

- [ ] **Alertas no Telegram (watchdog)**: Edge Function + `pg_cron` (5min) detecta gap >
      30min na tabela `sensor_leituras` e manda "🔴 sensor offline" via bot. Quando
      os dados voltam, manda "✅ voltou online". Usa flag `em_alerta` em tabela
      auxiliar para evitar spam. Cobre queda de energia E falha de WiFi com o mesmo
      mecanismo. Tokens em Supabase Secrets.
- [x] **Monitoramento de bateria + RSSI**: colunas `bateria_pct` (0–100%) e `rssi`
      em `sensor_leituras`; ESP32 envia `WiFi.RSSI()` e (opcional) % da bateria LiPo
      calculada de leitura ADC (3.0V=0% → 4.2V=100%); dashboard mostra % e dBm.
- [ ] **Buffer local no ESP32**: persistir em flash se POST falhar, reenviar no próximo ciclo
- [ ] **HTTPS com verificação de certificado** no ESP32 (`WiFiClientSecure` + CA pinning)
- [ ] **OTA**: atualização de firmware sem cabo

#### Próxima fase — Produção

- [x] **RLS endurecida**: Edge Function `sensor-ingest` com `service_role` validando
      `X-Device-Token`. Anon key não consegue mais inserir direto na tabela.
- [x] **Retenção automática**: `pg_cron` rodando `DELETE WHERE created_at < NOW() - 90d`
      todo dia 03:00 UTC (job `prune_sensor_leituras_90d`).
- [ ] **PWA**: cache offline e instalável no mobile
- [ ] **Testes**: Vitest (frontend) + mock do Supabase
- [ ] **i18n**: pt-BR / en

#### Backlog técnico

- [ ] Code-splitting do Recharts (bundle hoje em 744 kB)
- [ ] Migrar `StaticJsonDocument` → `JsonDocument` (ArduinoJson 7)
- [ ] Screenshot real no README (substituir placeholder)

---

## Troubleshooting

<details>
<summary><strong>DHT22 retorna NaN no Serial Monitor</strong></summary>

- Verifique a pinagem: VCC=3.3V, GND, DATA com resistor pull-up de ~10kΩ.
- O `delay(2000)` no setup é necessário para estabilizar o sensor — não reduza.
- Sensores genéricos podem falhar; teste com módulo de fabricante conhecido.

</details>

<details>
<summary><strong>ESP32 não conecta ao WiFi</strong></summary>

- O ESP32 **não suporta redes 5GHz** — use 2.4GHz.
- SSID e senha são case-sensitive.
- Aumente `WIFI_TIMEOUT_MS` se o roteador for lento.

</details>

<details>
<summary><strong>POST retorna 401 / 403 / RLS error</strong></summary>

- Confirme que `secrets.h` usa a chave **anon** (não a `service_role`).
- A policy `Inserção via anon key` precisa estar criada (rode `sql_setup.sql`).
- Verifique no painel Supabase: **Authentication → Policies**.

</details>

<details>
<summary><strong>Dashboard mostra "Configuração pendente"</strong></summary>

- Confirme `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` local
  ou nas Environment Variables do Vercel.
- A URL deve incluir `https://` e terminar em `.supabase.co`.
- Após editar `.env`, reinicie o `npm run dev`.

</details>

<details>
<summary><strong>Badge "Offline" no dashboard apesar de dados chegando</strong></summary>

- Confirme que `ALTER PUBLICATION supabase_realtime ADD TABLE sensor_leituras;` foi executado.
- No painel Supabase: **Database → Replication**, `sensor_leituras` precisa estar ativa.

</details>

---

## Licença

Distribuído sob a licença [MIT](LICENSE).
