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
Um microcontrolador ESP32 alimentado por bateria lê o sensor DHT22, opcionalmente
detecta sensores Inkbird IBS-TH2 via BLE, envia os dados via HTTPS para o Supabase
e entra em *deep sleep* para economia de energia. O dashboard React recebe
atualizações instantâneas via WebSocket. Sistema de alertas automático detecta
offline (>15min), bateria baixa e WiFi fraco, enviando notificações via Telegram.

### Por que este projeto

- **Custo baixo**: ESP32 (~R$ 35) + DHT22 (~R$ 20) + Supabase Free + Vercel Free.
- **Energia mínima**: deep sleep entre leituras estende a vida da bateria por semanas.
- **Tempo real**: Supabase Realtime entrega novos dados em < 1s sem polling.
- **Histórico**: até 24h de variação no gráfico, com média, mínima e máxima.

---

## Arquitetura

```text
┌─────────────┐    HTTPS POST    ┌──────────────────┐    Realtime (WS)    ┌──────────────┐
│   ESP32     │ ───────────────▶ │     Supabase     │ ──────────────────▶ │  Dashboard   │
│   DHT22     │   a cada 15min   │  PostgreSQL +    │   INSERT events     │  React/Vite  │
│  (sleep)    │                  │   Realtime + RLS │                     │   (Vercel)   │
└─────────────┘                  └──────────────────┘                     └──────────────┘
```

### Stack

| Camada           | Tecnologia                                           |
|------------------|------------------------------------------------------|
| Hardware         | ESP32, DHT22, Inkbird IBS-TH2 (BLE opcional)         |
| Firmware         | Arduino C++, DHT library, ArduinoJson, BLE scanner   |
| Backend          | Supabase (PostgreSQL 15 + Realtime + RLS + pg_cron) |
| Alertas          | Supabase Edge Functions + Telegram Bot               |
| Frontend         | React 18, Vite 5, Tailwind CSS 3, Recharts          |
| Deploy           | Vercel (frontend), Supabase (backend gerenciado)    |
| CI               | GitHub Actions (ESLint + Prettier + build)          |

---

## Estrutura do repositório

```text
GRAUCONST/
├── .github/workflows/ci.yml         CI: lint + format-check + build
├── .mcp.json                        Config do Supabase MCP server (Claude Code)
├── sql_setup.sql                    Schema do banco (tabela, RLS, Realtime, pg_cron)
├── seed.sql                         Dados de exemplo (opcional, só dev)
├── supabase/functions/
│   ├── sensor-ingest/index.ts       Edge Function gateway (valida DHT22 + Inkbird)
│   ├── telegram-alert/index.ts      Envia mensagens formatadas para Telegram
│   └── telegram-watchdog/README.md  Watchdog implementado via pg_cron (15 min)
├── esp32/
│   ├── grauconst_esp32.ino          Firmware (DHT22 + BLE Inkbird, deep sleep 15min)
│   ├── inkbird_decoder.h            Decoder para BLE manufacturer data (Inkbird)
│   ├── supabase_ca.h                Root CA (ISRG Root X1) para validação TLS
│   └── secrets.h.example            Template de credenciais
└── dashboard/
    ├── .env.example                 Template de variáveis Vite
    ├── vercel.json                  Config de deploy (rewrites SPA)
    └── src/
        ├── App.jsx                  Componente raiz + Realtime + estado
        ├── lib/supabase.js          Cliente e queries
        └── components/
            ├── StatCard.jsx             Card de leitura (temp / umidade)
            ├── GraficoTemperatura.jsx   Área chart com série DHT22 + Inkbird
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

### 5. Alertas Telegram (opcional)

Para receber notificações de offline, bateria baixa e WiFi fraco:

1. Crie um bot no Telegram: abra `@BotFather` e `/newbot`. Anote o token.
2. Pegue seu `chat_id`: abra `@userinfobot` e envie qualquer mensagem.
3. No Supabase **Edge Function Secrets**, adicione:
   - `TELEGRAM_BOT_TOKEN` (do BotFather)
   - `TELEGRAM_CHAT_ID` (seu ID; suporta múltiplos separados por vírgula)
   - `ALERTA_TEMP_MIN`, `ALERTA_TEMP_MAX` (limites em °C; padrão: -15 / -5)
   - `ALERTA_RSSI_MIN` (limite WiFi dBm; padrão: -85)
   - `ALERTA_BAT_MIN` (limite bateria %; padrão: 20)
4. Pronto. O watchdog rodará a cada 15 min e enviará alertas via Telegram.

### 6. Firmware (ESP32)

1. Na Arduino IDE, instale:
   - **DHT sensor library** (Adafruit)
   - **ArduinoJson** (v7+)
   - **ESP32 BLE Arduino** (pré-instalado no board ESP32)
2. Copie `esp32/secrets.h.example` para `esp32/secrets.h` e preencha SSID, senha,
   `SUPABASE_URL` e `DEVICE_TOKEN` (mesmo valor do passo 4).
3. Conecte o DHT22 ao GPIO 4 (alterável em `DHT_PIN`).
4. *(Opcional)* Se tiver Inkbird IBS-TH2, o BLE scanner procurará automaticamente.
5. Abra `esp32/grauconst_esp32.ino` e dê *Upload*.

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
├── id              BIGSERIAL      PK
├── sensor_id       TEXT           ESP32-<MAC>
├── temperatura     NUMERIC(5,2)   DHT22 (nullable se vem só Inkbird)
├── umidade         NUMERIC(5,2)   DHT22 (nullable)
├── bateria_pct     SMALLINT       ESP32 LiPo (nullable, 0-100%)
├── rssi            INT            WiFi signal (nullable, -120..0 dBm)
├── inkbird_temp    NUMERIC(5,2)   Sensor BLE Inkbird (nullable)
├── inkbird_hum     NUMERIC(5,2)   Sensor BLE Inkbird (nullable)
├── inkbird_bat     SMALLINT       Bateria Inkbird (nullable, 0-100%)
└── created_at      TIMESTAMPTZ    default NOW()
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
- **Watchdog Telegram**: alertas de offline (>15min), bateria baixa (<30%) e WiFi
  fraco (<-85 dBm) via bot, para 1 ou mais destinatários
- **Buffer flash no ESP32**: leituras feitas com WiFi indisponível ficam em NVS
  e são reenviadas no próximo ciclo com sucesso (FIFO circular, até 50 entradas)
- **HTTPS com validação de CA no ESP32**: cert chain ISRG Root X1 + NTP
- **OTA via Supabase Storage**: atualização de firmware sem cabo USB
- **PWA, code-splitting, i18n pt-BR/en, Vitest** no dashboard
- **Suporte Inkbird IBS-TH2**: BLE scanner detecta sensores Bluetooth,
  decodifica temperatura/umidade/bateria, envia junto com DHT22
- **Alertas Telegram automáticos**: watchdog via `pg_cron` (15 min) com
  cooldown por tipo (60min normal, 30min temperatura), detecta: offline
  (>15min), bateria crítica (≤5%), bateria baixa (≤20%), WiFi fraco (<-85dBm)
- **Validação robusta**: Edge Function `sensor-ingest` valida DHT22 + Inkbird,
  rejeita se nenhum sensor enviou dados, cooldown evita alertas duplicados

### 🛣️ Roadmap

Itens priorizados para próximas iterações. Pull requests bem-vindos.

#### Próxima fase — UX

- [x] **Multi-sensor**: ESP32 identifica-se pelo MAC (`ESP32-AABBCCDDEEFF`); dashboard
      tem dropdown que aparece quando há mais de 1 sensor enviando dados.
- [x] **Suporte Inkbird BLE**: ESP32 escaneia BLE periodicamente, decodifica
      IBS-TH2, envia temperatura/umidade/bateria junto com DHT22.
- [ ] **Export de dados**: download CSV/JSON do histórico filtrado
- [ ] **Alertas por threshold customizados**: UI para ajustar limites de alerta
- [ ] **Tema claro / escuro** com toggle

#### Próxima fase — Robustez

- [x] **Alertas no Telegram (watchdog)**: `pg_cron` (15min) detecta:
      offline (gap > 15min), bateria crítica (≤5%), bateria baixa (≤20%),
      WiFi fraco (<-85dBm). Cooldown evita spam (60min por tipo, 30min temp).
      Suporta múltiplos destinatários (`TELEGRAM_CHAT_ID` separado por vírgula).
- [x] **Suporte Inkbird IBS-TH2**: BLE scanner no ESP32, decodificador de
      manufacturer data, validação na Edge Function, dashboard mostra série
      de dados separada.
- [x] **Monitoramento de bateria + RSSI**: colunas `bateria_pct` (0–100%) e `rssi`
      em `sensor_leituras`; ESP32 envia `WiFi.RSSI()` e (opcional) % da bateria LiPo
      calculada de leitura ADC (3.0V=0% → 4.2V=100%); dashboard mostra % e dBm.
- [x] **Buffer local no ESP32**: leituras com WiFi indisponível ficam em NVS
      (`Preferences`, FIFO circular de até 50 entradas) e drenam no próximo ciclo
      com sucesso.
- [x] **HTTPS com verificação de certificado** no ESP32: `WiFiClientSecure` +
      ISRG Root X1 (Let's Encrypt) + NTP. Fallback `setInsecure()` opcional via
      `#define SKIP_TLS_VERIFY` em `secrets.h`.
- [x] **OTA via Supabase Storage**: bucket público `firmware` com `version.json`
      apontando para o `.bin`. Check a cada 10 boots. Ver [OTA](#ota--atualizar-firmware-sem-cabo).

#### Próxima fase — Produção

- [x] **RLS endurecida**: Edge Function `sensor-ingest` com `service_role` validando
      `X-Device-Token`. Anon key não consegue mais inserir direto na tabela.
- [x] **Retenção automática**: `pg_cron` rodando `DELETE WHERE created_at < NOW() - 90d`
      todo dia 03:00 UTC (job `prune_sensor_leituras_90d`).
- [x] **PWA**: cache offline e instalável no mobile
- [x] **Testes**: Vitest (frontend) + mock do Supabase
- [x] **i18n**: pt-BR / en

#### Backlog técnico

- [x] Code-splitting do Recharts (Recharts em chunk separado, lazy-loaded)
- [x] Migrar `StaticJsonDocument` → `JsonDocument` (ArduinoJson 7)
- [ ] Screenshot real no README (substituir placeholder)

---

## OTA — atualizar firmware sem cabo

Depois que o ESP32 estiver instalado no campo, novas versões de firmware podem
ser empurradas via Supabase Storage:

1. **Crie um bucket público** chamado `firmware` em **Storage** no Supabase
   (marque *public* — sem isso o ESP32 recebe 403).
2. **Faça upload** de dois arquivos para o bucket:
   - `firmware.bin` — exportado pela Arduino IDE em *Sketch → Export Compiled Binary*.
   - `version.json` — manifest apontando para o `.bin`:

     ```json
     {
       "version": "1.0.1",
       "url": "https://SEU_REF.supabase.co/storage/v1/object/public/firmware/firmware.bin"
     }
     ```

3. **Bump** do `#define FIRMWARE_VERSION` em `esp32/secrets.h` antes de exportar
   o `.bin` — a comparação é string e precisa ser diferente da versão atualmente
   instalada no dispositivo.
4. No próximo boot em que o ESP32 fizer o check (a cada 10 boots por padrão,
   `OTA_CHECK_EVERY_N_BOOTS` em `secrets.h`), ele baixa o novo binário e reinicia.

Se o bucket ou os arquivos não existirem, o check falha silenciosamente e o
firmware continua operando — não há risco de bricar o dispositivo.

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
