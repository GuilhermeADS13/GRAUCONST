# GrauConst — Alertas, Watchdog e PWA

## Limites configurados

| Alerta          | Condição              | Cooldown  |
|-----------------|-----------------------|-----------|
| 🥶 temp_baixa   | temperatura < -15°C   | 30 min    |
| 🔥 temp_alta    | temperatura > -5°C    | 30 min    |
| 📶 wifi_fraco   | rssi < -85 dBm        | 30 min    |
| 🔋 bateria_fraca| bateria_pct ≤ 20%     | 120 min   |
| 🪫 bateria_critica| bateria_pct ≤ 5%    | 60 min    |
| ⚠️ watchdog     | > 15 min sem leitura  | 30 min    |
| ❌ umidade       | **não alertado**      | —         |

---

## Arquivos criados/modificados

```
supabase/functions/telegram-alert/index.ts   ← Edge Function nova
supabase/functions/sensor-ingest/index.ts    ← atualizado com alertas
migration_alertas.sql                         ← tabela cooldown + pg_cron
dashboard/public/sw.js                        ← Service Worker PWA
dashboard/public/manifest.json                ← PWA instalável
dashboard/src/hooks/usePushNotifications.js   ← hook push
dashboard/src/components/BotaoNotificacao.jsx ← botão 🔔 no header
```

---

## Passo a passo de deploy

### PASSO 1 — Secrets no Supabase
Settings → Edge Functions → Secrets → Add new secret

```
TELEGRAM_BOT_TOKEN    = token do seu bot
TELEGRAM_CHAT_ID      = 8540644053
ALERTA_TEMP_MIN       = -15
ALERTA_TEMP_MAX       = -5
ALERTA_RSSI_MIN       = -85
ALERTA_BAT_MIN        = 20
```

---

### PASSO 2 — Executar SQL no Supabase
SQL Editor → colar `migration_alertas.sql` → Run

Depois configurar variáveis do pg_cron (substituir pelos valores reais):
```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://SEU_ID.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'sua_service_role_key_aqui';
```

---

### PASSO 3 — Deploy das Edge Functions
```bash
supabase functions deploy telegram-alert
supabase functions deploy sensor-ingest
```

---

### PASSO 4 — Integrar no App.jsx

#### 4a. Importar hook e componente
```jsx
import { usePushNotifications } from './hooks/usePushNotifications'
import { BotaoNotificacao } from './components/BotaoNotificacao'
```

#### 4b. Usar o hook dentro do componente Dashboard
```jsx
const { verificarENotificar } = usePushNotifications()
```

#### 4c. Chamar no handler do Realtime (dentro do .on INSERT):
```jsx
({ new: novo }) => {
  setUltimo(novo)
  setHistorico((prev) => {
    const corte = new Date(Date.now() - periodoConfig.ms)
    return [...prev.filter((d) => new Date(d.created_at) > corte), novo]
  })
  setNovoDado(true)
  setTimeout(() => setNovoDado(false), 3000)

  // ← ADICIONAR esta linha:
  verificarENotificar(novo)
}
```

#### 4d. Adicionar botão no header (ao lado do LiveBadge):
```jsx
<div className="flex items-center gap-3">
  <BotaoNotificacao />
  <LanguageToggle />
  <LiveBadge realtime={realtime} />
</div>
```

---

### PASSO 5 — index.html (dashboard/index.html)
Adicionar no `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0f172a" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="GrauConst" />
```

---

### PASSO 6 — Ícones PWA
Gerar em `dashboard/public/icons/` usando https://realfavicongenerator.net/
Tamanhos: 72, 96, 128, 144, 152, 192, 384, 512 px

---

### PASSO 7 — Push para o GitHub
```bash
git add .
git commit -m "feat: alertas Telegram, watchdog 15min, bateria e PWA"
git push origin main
```
Vercel redeploya automaticamente.

---

## Arquitetura

```
ESP32 → sensor-ingest
          ├── temp < -15°C  → 🥶 Telegram
          ├── temp > -5°C   → 🔥 Telegram
          ├── rssi < -85    → 📶 Telegram
          ├── bat ≤ 5%      → 🪫 Telegram (crítico)
          └── bat ≤ 20%     → 🔋 Telegram (fraca)

pg_cron (cada 15 min)
          └── sem leitura > 15min → ⚠️ Telegram

Dashboard Realtime
          └── novo dado → verificarENotificar()
                            ├── temp fora do range → 🔔 Push
                            ├── bat baixa          → 🔔 Push
                            └── wifi fraco         → 🔔 Push
```
