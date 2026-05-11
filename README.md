# GRAUCONST — Monitor Ambiental ESP32 + Supabase

Dashboard de monitoramento de temperatura e umidade em tempo real usando ESP32 com sensor DHT22 e Supabase Realtime.

## Estrutura

```
GRAUCONST/
├── sql_setup.sql          # Script SQL para rodar no Supabase
├── esp32/
│   └── grauconst_esp32.ino  # Código Arduino para ESP32 com Deep Sleep
└── dashboard/             # Frontend React + Tailwind + Recharts
    ├── src/
    │   ├── App.jsx           # Componente principal
    │   ├── lib/supabase.js   # Cliente Supabase + queries
    │   └── components/
    │       ├── StatCard.jsx
    │       ├── GraficoTemperatura.jsx
    │       └── LiveBadge.jsx
    └── .env.example
```

## Setup

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com)
2. Abra o **Editor SQL** e execute o conteúdo de `sql_setup.sql`
3. Copie a **Project URL** e a **anon key** (Settings → API)

### 2. Dashboard
```bash
cd dashboard
npm install
cp .env.example .env
# Edite .env com sua URL e anon key
npm run dev
```

### 3. ESP32 (Arduino IDE)
1. Instale as bibliotecas: `DHT sensor library`, `ArduinoJson`
2. Abra `esp32/grauconst_esp32.ino`
3. Preencha `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY`
4. Faça o upload para o ESP32

## Como funciona
- ESP32 acorda, lê DHT22, envia HTTP POST para Supabase, dorme por 15 min
- Dashboard busca o último registro ao abrir
- Supabase Realtime notifica o dashboard assim que o ESP32 insere um novo dado
- Gráfico mostra variação de temperatura e umidade nas últimas 24h
