<div align="center">

# GRAUCONST

**Monitoramento IoT de temperatura e umidade em tempo real**

Sistema completo de ponta a ponta: do sensor (Inkbird IBS-TH2 via BLE) até o
dashboard web, com sincronização em tempo real via Supabase Realtime e alertas
no Telegram.

[![CI](https://github.com/GuilhermeADS13/GRAUCONST/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilhermeADS13/GRAUCONST/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Visão geral

O GRAUCONST monitora a temperatura/umidade de um ambiente (ex.: um freezer de
loja) em ciclos de 15 minutos. O sensor é um **Inkbird IBS-TH2** (Bluetooth LE),
que fica **dentro** do freezer. Um **ESP32** funciona como gateway: fica do lado
de fora, lê o Inkbird por **BLE**, envia os dados por **HTTPS** para o Supabase e
entra em *deep sleep* para economizar bateria. O dashboard React recebe os dados
em tempo real via WebSocket, e um watchdog avisa no Telegram se o sensor ficar
offline (queda de energia, internet ou WiFi).

### Por que este projeto

- **Custo baixo**: ESP32 (~R$ 35) + Inkbird IBS-TH2 + Supabase Free + Vercel Free.
- **Sensor dentro do freezer**: o Inkbird mede onde importa; o ESP32 fica fora,
  perto da energia/WiFi, e lê por Bluetooth.
- **Energia mínima**: deep sleep entre leituras estende a bateria por semanas.
- **Tempo real**: Supabase Realtime entrega novos dados em < 1s (com fallback de
  re-sync a cada 60s, caso o WebSocket caia).
- **Alertas**: temperatura fora da faixa, bateria do Inkbird baixa, WiFi fraco e
  sensor offline — tudo no Telegram, com mensagens de "normalizou".

---

## Arquitetura

```text
  Inkbird IBS-TH2          ESP32 (gateway)         Supabase                Dashboard
 ┌───────────────┐  BLE  ┌───────────────┐ HTTPS ┌──────────────────┐ WS ┌───────────┐
 │ dentro do     │ ────▶ │ scan BLE +    │ ────▶ │ Edge Function +  │ ──▶│ React/Vite│
 │ freezer       │       │ WiFi (15min)  │ POST  │ PostgreSQL +     │    │ (Vercel)  │
 │ (temp/umid)   │       │ + deep sleep  │       │ Realtime + RLS   │    │           │
 └───────────────┘       └───────────────┘       └──────────────────┘    └───────────┘
                                                          │
                                                     pg_cron (5min)
                                                          ▼
                                                  watchdog → Telegram
```

### Stack

| Camada    | Tecnologia                                                       |
|-----------|------------------------------------------------------------------|
| Sensor    | Inkbird IBS-TH2 (Bluetooth LE)                                    |
| Gateway   | ESP32 (DevKit V1), Arduino C++                                    |
| Firmware  | WiFiMulti, WiFiClientSecure (HTTPS), ArduinoJson, BLE scanner     |
| Backend   | Supabase (PostgreSQL + Realtime + RLS + pg_cron + pg_net)         |
| Alertas   | Supabase Edge Functions + Telegram Bot                           |
| Frontend  | React 18, Vite 5, Tailwind CSS 3, Recharts, PWA, i18n            |
| Deploy    | Vercel (frontend), Supabase (backend gerenciado)                 |
| CI        | GitHub Actions (ESLint + Prettier + build)                       |

---

## Estrutura do repositório

```text
GRAUCONST/
├── .github/workflows/ci.yml             CI: lint + format-check + build
├── .mcp.json                            Config do Supabase MCP server (Claude Code)
├── sql_setup.sql                        Schema do banco (tabelas, RLS, Realtime, pg_cron)
├── seed.sql                             Dados de exemplo (opcional, só dev)
├── supabase/functions/
│   ├── sensor-ingest/index.ts           Edge Function gateway (valida + insere + alerta)
│   └── telegram-alert/index.ts          Monta e envia as mensagens do Telegram
├── esp32/grauconst_esp32/               Sketch (pasta = nome do .ino, padrão Arduino)
│   ├── grauconst_esp32.ino              Firmware: Inkbird BLE + WiFi + deep sleep 15min
│   ├── inkbird_decoder.h                Decoder do manufacturer data do IBS-TH2
│   ├── supabase_ca.h                    Root CA (mantido como referência; ver TLS abaixo)
│   ├── secrets.h.example                Template de credenciais
│   └── secrets.h                        Suas credenciais (no .gitignore — não commitado)
└── dashboard/
    ├── .env.example                     Template de variáveis Vite
    ├── vercel.json                      Config de deploy (rewrites SPA)
    └── src/
        ├── App.jsx                      Componente raiz + Realtime + estado
        ├── utils.js                     Classificadores + nomeSensor (nome amigável)
        ├── lib/supabase.js              Cliente e queries
        ├── i18n/                        Traduções pt-BR / en
        └── components/                  StatCard, GraficoTemperatura, LiveBadge, ...
```

---

## Setup rápido

### 1. Backend (Supabase)

1. **Crie um projeto** em [database.new](https://database.new).
2. No painel → **SQL Editor**, cole o conteúdo de [sql_setup.sql](sql_setup.sql) e
   clique em **Run**. Isso cria as tabelas, RLS, Realtime e os jobs do pg_cron.
3. *(Opcional)* Cole [seed.sql](seed.sql) e **Run** para popular o gráfico com
   dados de exemplo.
4. Habilite as extensões necessárias (SQL Editor):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;   -- o watchdog usa net.http_post
   ```
5. Em **Settings → API**, copie o `Project URL` e a chave **publishable** (formato
   novo `sb_publishable_...` ou a `anon` legada `eyJ...`). Ambas são públicas e
   seguras no frontend.

> 💡 **Trabalhando com IA?** O repositório inclui um [`.mcp.json`](.mcp.json) que
> expõe o Supabase MCP server para o Claude Code (rode `/mcp` para autenticar).

### 2. Frontend (local)

```bash
cd dashboard
npm install
cp .env.example .env       # preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                # http://localhost:5173
```

Se o `.env` faltar, o dashboard mostra a tela **Configuração pendente** — não quebra.

### 3. Deploy (Vercel)

1. [vercel.com](https://vercel.com) → **Import Project** → escolha o repositório.
2. **Root Directory:** `dashboard`
3. **Environment Variables:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. **Deploy.** A cada push em `main`, o Vercel redeploya automaticamente.

> ⚠️ **PWA / cache:** o dashboard é um PWA (service worker, `autoUpdate`). Depois
> de um deploy, pode ser necessário recarregar 2x ou abrir em aba anônima para o
> service worker trocar pela versão nova.

### 4. Edge Function — secrets (no Supabase)

Em **Project Settings → Edge Functions → Secrets**, adicione:

| Secret | Para quê | Padrão |
|--------|----------|--------|
| `DEVICE_TOKEN` | Token compartilhado com o ESP32 (header `X-Device-Token`) | — |
| `TELEGRAM_BOT_TOKEN` | Token do `@BotFather` | — |
| `TELEGRAM_CHAT_ID` | chat_id(s), separados por vírgula | — |
| `ALERTA_TEMP_MIN` / `ALERTA_TEMP_MAX` | Faixa de temperatura (°C) | `-20` / `-5` |
| `ALERTA_RSSI_MIN` | Limite de WiFi (dBm) | `-85` |
| `ALERTA_BAT_MIN` | Limite de bateria do Inkbird (%) | `20` |

Gere o `DEVICE_TOKEN` com `openssl rand -hex 32` e use o **mesmo valor** no
`esp32/grauconst_esp32/secrets.h`.

### 5. Firmware (ESP32)

1. Na Arduino IDE, instale a **ArduinoJson** (v7+). `WiFiMulti` e `BLE` já vêm
   no core ESP32.
2. Copie `secrets.h.example` → `secrets.h` na pasta `esp32/grauconst_esp32/` e
   preencha (ver [Configuração do firmware](#configuração-do-firmware-secretsh)).
3. **Partição:** em *Ferramentas → Partition Scheme*, escolha
   **"Huge APP (3MB No OTA/1MB SPIFFS)"** — o firmware (BLE + WiFi + HTTPS) ocupa
   ~1,77 MB e **não cabe** no esquema padrão de 1,2 MB.
4. Selecione a placa **ESP32 Dev Module** e a porta correta, e dê *Upload*.
5. Posicione o **ESP32 bem perto do freezer** (BLE não atravessa metal a distância).

### 6. Case 3D + alimentação

O ESP32 e o pack de baterias ficam num **case impresso em 3D** (modelado no Tinkercad):

🔗 **[Case 3D — grauconstV10 (Tinkercad)](https://www.tinkercad.com/things/7F7QuLijzrz-grauconstv10?sharecode=QbjpnG5zoQ4FSb51ZVZOw1qgFdgzRbSOkfUw06hGJNs)**

**Diagrama de ligação** (tudo compartilha o `VIN` e o `GND` da placa):

```text
  VIN ──┬── Bateria (+)        2x 18650 em série (7,4 V)
        ├── Capacitor (+)      2200µF / 25V
        └──[ 100kΩ ]──┬── GPIO34      ← ESP32 lê a tensão da bateria
                      │
                   [ 47kΩ ]
                      │
  GND ──┬── Bateria (−)        │
        ├── Capacitor (−)      │
        └─────────────────────┘
```

- **Alimentação:** 2x **18650 em série (7,4 V)** no `VIN`. O **capacitor
  2200µF/25V** entre `VIN` e `GND` absorve o pico de corrente do WiFi e evita o
  *brownout* (reset ao ligar) com células de qualidade baixa.
- **Leitura da bateria (opcional):** o divisor **100kΩ + 47kΩ** leva a tensão do
  pack pro `GPIO34`. Defina `BATTERY_PIN 34` no `secrets.h`. O ESP32 calcula a %
  e envia em `esp32_bat_pct`. Faixa do pack 2S: **8,4 V = 100% · 6,0 V = 0%**.
- ⚠️ **Polaridade do capacitor:** a perna do lado da **listra é a (−)** → vai no
  `GND`. Invertido, o capacitor pode estufar.
- 💡 O DevKit V1 tem **1 pino VIN** e **vários GND** — junte os "+" no VIN e
  distribua os "−" pelos GNDs.

---

## Configuração do firmware (`secrets.h`)

```c
// WiFi — rede principal (obrigatória)
#define WIFI_SSID       "..."
#define WIFI_PASSWORD   "..."
// Redes de backup (opcionais) — conecta na mais forte disponível (WiFiMulti)
//#define WIFI_SSID2    "..."
//#define WIFI_PASSWORD2 "..."

#define SUPABASE_URL    "https://SEU_REF.supabase.co"
#define DEVICE_TOKEN    "..."     // igual ao secret DEVICE_TOKEN no Supabase
#define SENSOR_ID       ""        // vazio = auto "ESP32-<MAC>"

// Inkbird IBS-TH2 (BLE)
#define BLE_SCAN_TIME   20        // segundos de scan
//#define INKBIRD_MAC   "AA:BB:CC:DD:EE:FF"  // (opcional) trava no MAC do seu sensor

// Bateria do ESP32 (opcional) — divisor 100kΩ+47kΩ no GPIO34
#define BATTERY_PIN     34        // comente para desativar a leitura da bateria

//#define SKIP_TLS_VERIFY          // ver seção TLS abaixo
```

---

## Como funciona

- O ESP32 acorda a cada 15 min, escaneia o BLE (`BLE_SCAN_TIME`) e procura o
  Inkbird IBS-TH2 (por nome `sps`/`tps`, ou pelo `INKBIRD_MAC` se definido).
- Decodifica temperatura/umidade/bateria do manufacturer data e faz `POST` para a
  Edge Function `sensor-ingest` (HTTPS, header `X-Device-Token`).
- A `sensor-ingest` usa a temperatura/umidade do Inkbird como **valores
  principais** (a coluna `temperatura` é `NOT NULL`), e também guarda os brutos em
  `inkbird_temp/hum/bat`.
- Se o Inkbird não for encontrado, o ESP32 **não envia** nada e dorme.
- O dashboard exibe a leitura via Realtime; um job pg_cron (a cada 5 min) checa se
  o sensor parou de enviar.

### TLS / HTTPS

A conexão é **criptografada (HTTPS)** via `WiFiClientSecure`, mas com
`setInsecure()` — ou seja, **sem validar o certificado** do servidor. A validação
por CA (`setCACert`) estava falhando no handshake (`HTTPClient` retornava `-1`),
provavelmente por cadeia/raiz incompleta ou relógio sem NTP. Para dados de
temperatura numa rede de loja, o `setInsecure` é um trade-off aceitável (conexão
cifrada, sem checar a identidade do servidor).

---

## Alertas (Telegram)

Gerados pela `sensor-ingest` (a cada leitura) e pelo watchdog (pg_cron). Todos
mostram um **nome amigável** do sensor (mapa `SENSOR_NOMES` em `telegram-alert`).

| Alerta | Condição | Cooldown | Recuperação |
|--------|----------|----------|-------------|
| 🔥 `temp_alta` | temp > `TEMP_MAX` (−5 °C) | 30 min | ✅ `temp_ok` |
| 🥶 `temp_baixa` | temp < `TEMP_MIN` (−20 °C) | 30 min | ✅ `temp_ok` |
| 📶 `wifi_fraco` | rssi < `RSSI_MIN` (−85 dBm) | 30 min | ✅ `wifi_ok` |
| 🔋 `bateria_fraca` | `inkbird_bat` ≤ `BAT_MIN` (20%) | 60 min | ✅ `bateria_ok` |
| 🪫 `bateria_critica` | `inkbird_bat` ≤ 5% | 60 min | ✅ `bateria_ok` |
| 🔋 `esp32_bat_fraca` | bateria do ESP32 ≤ `BAT_MIN` (20%) | 60 min | ✅ `esp32_bat_ok` |
| 🪫 `esp32_bat_critica` | bateria do ESP32 ≤ 5% | 60 min | ✅ `esp32_bat_ok` |
| ⚠️ `watchdog` (offline) | sem leitura > 18 min | 30 min | ✅ `watchdog_ok` |

> O **watchdog** é um job pg_cron inline (`cron.job` `watchdog-sensor`, `*/5`) que
> usa `net.http_post` (extensão **pg_net**) para chamar a `telegram-alert`. A
> "temperatura" usada nos alertas é a efetiva (a do Inkbird).

---

## Modelo de dados

```sql
sensor_leituras
├── id            BIGSERIAL     PK
├── sensor_id     TEXT          "ESP32-<MAC>" (ou SENSOR_ID definido)
├── temperatura   NUMERIC(5,2)  temperatura efetiva (= Inkbird) — NOT NULL
├── umidade       NUMERIC(5,2)  umidade efetiva (= Inkbird), nullable
├── rssi          INT           sinal WiFi do ESP32 (dBm), nullable
├── bateria_pct   SMALLINT      bateria do ESP32 — campo legado (FW 1.1.0), nullable
├── esp32_bat_pct SMALLINT      bateria do pack 2S do ESP32 (divisor GPIO34), nullable
├── inkbird_temp  NUMERIC(5,2)  bruto do Inkbird, nullable
├── inkbird_hum   NUMERIC(5,2)  bruto do Inkbird, nullable
├── inkbird_bat   SMALLINT      bateria do Inkbird (0-100%), nullable
└── created_at    TIMESTAMPTZ   default NOW()

sensor_alertas      estado por sensor (colunas em_offline, em_bateria_baixa, ...)
alerta_cooldown     marcador de cooldown por (sensor_id, tipo)
```

**RLS** ativa em todas as tabelas: `SELECT` é público (dashboard sem login);
`INSERT` só via `service_role` dentro da Edge Function `sensor-ingest`
(autenticada por `X-Device-Token`). A anon/publishable key **não** insere.

---

## Scripts (em `dashboard/`)

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (HMR) |
| `npm run build` | Build de produção (`dist/`) |
| `npm run preview` | Preview do build |
| `npm run lint` | ESLint (falha com qualquer warning) |
| `npm run format` / `format:check` | Prettier (aplica / verifica) |
| `npm run test` | Vitest |

---

## Dashboard

- **Seção Inkbird**: temperatura, umidade e bateria do sensor.
- **Seção Dispositivo ESP32**: WiFi (RSSI) e **bateria do ESP32** (pack 2S via
  divisor no GPIO34). O card de bateria aparece quando há leitura
  (`esp32_bat_pct` ou `bateria_pct`).
- **Card de status**: "Última leitura há X min · próxima em ~Y min" (clicável para
  re-sincronizar).
- **Realtime** (LiveBadge) + **fallback de re-sync a cada 60s**.
- Gráfico com filtros 1h / 24h / 7d / 30d (média, mín, máx), PWA, i18n (pt-BR/en).

---

## Troubleshooting

<details>
<summary><strong>O ESP32 não acha o Inkbird (BLE)</strong></summary>

- **Aproxime o ESP32 do freezer.** O metal é uma gaiola de Faraday — o sinal BLE
  de dentro de um freezer fechado só alcança ~1-2 m do lado de fora. 10 m não dá.
- Feche o **app Engbird** / desligue o Bluetooth do celular: enquanto o app está
  conectado, o Inkbird **para de transmitir** os advertisements.
- Confirme o MAC no Serial e, se quiser, fixe via `#define INKBIRD_MAC`.
</details>

<details>
<summary><strong>"Sketch too big" ao compilar</strong></summary>

- Selecione *Partition Scheme* → **Huge APP (3MB No OTA/1MB SPIFFS)**. O firmware
  ocupa ~1,77 MB e não cabe no esquema padrão (1,2 MB).
</details>

<details>
<summary><strong>A placa liga mas reseta / não envia (na bateria)</strong></summary>

- É **brownout**: a bateria não segura o pico de corrente do WiFi. Um único 18650
  (3,7 V) no VIN é tensão baixa demais; células genéricas "8000mAh" têm
  resistência interna alta. Use **2x 18650 em série (7,4 V)** no VIN (ou um power
  bank USB 5V), com conexões firmes (sem garras jacaré).
- **Solução definitiva:** um **capacitor de 2200µF/25V** entre `VIN` e `GND`
  absorve o pico do WiFi — funciona até com células fracas. Pilhas de marca
  (Samsung/LG, ~3000mAh reais) também resolvem.
- ⚠️ **Nunca** ligue VIN (bateria) e USB ao mesmo tempo — a tensão volta pela USB
  e pode desligar/danificar o PC.
</details>

<details>
<summary><strong>POST retorna 400 / -1</strong></summary>

- **400**: payload inválido (ex.: sem temperatura nem Inkbird). Veja o corpo da
  resposta nos logs da Edge Function.
- **-1**: falha de TLS/conexão. O firmware usa `setInsecure()`; se voltar a dar
  -1, verifique WiFi/internet.
</details>

<details>
<summary><strong>Não chega o alerta de "Sem Sinal" (offline)</strong></summary>

- O watchdog usa `net.http_post` → exige a extensão **pg_net** habilitada
  (`create extension pg_net;`).
- Confira `cron.job_run_details` (jobid do `watchdog-sensor`) por erros, e se o
  job está `active = true`.
</details>

<details>
<summary><strong>Dashboard não atualiza / "torto" após deploy</strong></summary>

- É o **cache do service worker (PWA)**. Recarregue 2x, abra em aba anônima, ou
  em DevTools → Application → Service Workers → Unregister + Clear site data.
</details>

---

## Licença

Distribuído sob a licença [MIT](LICENSE).
