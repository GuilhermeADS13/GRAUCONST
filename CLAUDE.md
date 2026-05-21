# GRAUCONST — Claude Code Guide

Sistema IoT de monitoramento ambiental em tempo real.
ESP32 + DHT22 → Supabase → React dashboard → Vercel.

## Estrutura do projeto

```
esp32/               Firmware Arduino (C++)
  grauconst_esp32.ino
  secrets.h          ← NÃO commitado (.gitignore)
  secrets.h.example  ← template para preencher
  supabase_ca.h      Certificado TLS (ISRG Root X1)

supabase/functions/
  sensor-ingest/     Recebe leituras do ESP32 (POST, auth via X-Device-Token)
  telegram-watchdog/ Cron a cada 5 min — detecta offline/bateria/wifi
  telegram-alert/    Envia mensagens formatadas para o Telegram

dashboard/           React 18 + Vite 5 + Tailwind CSS
  src/
    App.jsx          Componente raiz + Dashboard
    lib/supabase.js  Cliente Supabase + fetchUltimoRegistro/fetchHistorico
    components/      StatCard, GraficoTemperatura, LiveBadge, SeletorPeriodo...
    i18n/            Traduções PT-BR e EN
    utils.js         classificarTemp/Umidade/Bateria/Wifi + formatDataHora
  .env               ← NÃO commitado — copiar de .env.example
  .env.example       template com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY

sql_setup.sql        Schema completo do banco (rodar no Supabase SQL Editor)
seed.sql             Dados de exemplo para desenvolvimento
.github/workflows/ci.yml  Lint + build + test no GitHub Actions
```

## Banco de dados (Supabase)

Projeto: `ndcslvrjlmbanrqbwifn` — `https://ndcslvrjlmbanrqbwifn.supabase.co`

Tabelas:
- `sensor_leituras` — leituras do ESP32 (temperatura, umidade, rssi, bateria_pct)
- `sensor_alertas` — estado atual dos alertas por sensor (upsert pelo watchdog)
- `alerta_cooldown` — evita alertas repetidos em curto intervalo

RLS ativo em todas as tabelas. SELECT é público. INSERT só via `service_role` (Edge Function).

## Fluxo de dados

```
ESP32 (15 min)
  → POST /functions/v1/sensor-ingest  (header: X-Device-Token)
  → INSERT sensor_leituras
  → Realtime WebSocket → Dashboard React
  → pg_cron (5 min) → telegram-watchdog → telegram-alert → Telegram
```

## Comandos úteis

```bash
# Dashboard
cd dashboard
npm run dev          # dev server (localhost:5173)
npm run build        # build de produção
npm run test         # vitest
npm run lint         # eslint
npm run format       # prettier

# Git
git add <files> && git commit -m "tipo(escopo): mensagem"
git push             # push para github.com/GuilhermeADS13/GRAUCONST

# Arduino CLI (ESP32)
arduino-cli compile --fqbn esp32:esp32:esp32 esp32/
arduino-cli upload  --fqbn esp32:esp32:esp32 --port COM<N> esp32/
```

## Variáveis de ambiente

### Dashboard (`dashboard/.env`)
```
VITE_SUPABASE_URL=https://ndcslvrjlmbanrqbwifn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### ESP32 (`esp32/secrets.h`)
```c
#define WIFI_SSID        "..."
#define WIFI_PASSWORD    "..."
#define SUPABASE_URL     "https://ndcslvrjlmbanrqbwifn.supabase.co"
#define DEVICE_TOKEN     "..."   // mesmo valor do secret DEVICE_TOKEN no Supabase
#define SENSOR_ID        ""      // vazio = usa ESP32-<MAC>
#define FIRMWARE_VERSION "1.0.0"
```

### Supabase Edge Functions (secrets no dashboard do Supabase)
- `DEVICE_TOKEN` — token compartilhado com o ESP32
- `TELEGRAM_BOT_TOKEN` — token do @BotFather
- `TELEGRAM_CHAT_ID` — chat_id(s) separados por vírgula
- `ALERTA_TEMP_MIN` / `ALERTA_TEMP_MAX` — limites de temperatura (padrão: -15 / -5)
- `ALERTA_RSSI_MIN` — limite de sinal WiFi (padrão: -85 dBm)
- `ALERTA_BAT_MIN` — limite de bateria (padrão: 20%)

## Deploy

- **Dashboard** → Vercel (auto-deploy no push para `main`)
- **Edge Functions** → deploy manual via Supabase CLI ou MCP
- **Firmware** → Arduino IDE 1.8.19 ou `arduino-cli`

## MCP disponíveis nesta sessão

- **Supabase** — `execute_sql`, `list_tables`, `deploy_edge_function`, `get_logs`...
- **Vercel** — gerenciar deploys e env vars (requer OAuth na primeira sessão)
