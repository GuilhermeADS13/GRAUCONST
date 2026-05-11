# GRAUCONST — Monitor IoT de Temperatura

Dashboard em tempo real para monitoramento de temperatura via ESP32 + DHT22 + Supabase.

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS + Recharts
- **Backend:** Supabase (PostgreSQL + Realtime)
- **Hardware:** ESP32 + sensor DHT22
- **Deploy:** Vercel

## Estrutura

```
GRAUCONST/
├── sql_setup.sql              # Script SQL do Supabase
├── esp32/
│   └── grauconst_esp32.ino    # Código ESP32 com deep sleep
└── dashboard/
    ├── vercel.json            # Config deploy Vercel
    ├── .env.example           # Variáveis de ambiente
    └── src/
        ├── App.jsx
        ├── lib/supabase.js
        └── components/
            ├── StatCard.jsx
            ├── GraficoTemperatura.jsx
            └── LiveBadge.jsx
```

## Setup

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com)
2. Editor SQL → execute `sql_setup.sql`
3. Copie **Project URL** e **anon key** (Settings → API)

### 2. Local
```bash
cd dashboard
npm install
cp .env.example .env
# Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON no .env
npm run dev
```

### 3. Deploy Vercel
1. Importe o repositório no [vercel.com](https://vercel.com)
2. **Root Directory:** `dashboard`
3. **Framework:** Vite (detectado automaticamente)
4. **Environment Variables:**
   - `VITE_SUPABASE_URL` = sua Project URL
   - `VITE_SUPABASE_ANON` = sua anon key
5. Deploy! ✅

### 4. ESP32
1. Arduino IDE: instale `DHT sensor library` e `ArduinoJson`
2. Abra `esp32/grauconst_esp32.ino`
3. Preencha `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY`
4. Upload para o ESP32

## Como funciona
- ESP32 acorda → lê DHT22 → HTTP POST para Supabase → deep sleep 15 min
- Dashboard busca último registro ao abrir
- Supabase Realtime atualiza os dados sem reload
- Gráfico de área mostra variação de temperatura nas últimas 24h
