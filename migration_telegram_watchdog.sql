-- ============================================================
--  migration_telegram_watchdog.sql
--
--  Cria a tabela sensor_alertas (estado dos alertas por sensor)
--  e agenda o pg_cron para chamar a Edge Function a cada 5 min.
--
--  Pré-requisitos:
--    1. Edge Function `telegram-watchdog` deployada
--    2. Secrets TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID configurados
--    3. Esta migration rodada no SQL Editor do Supabase
-- ============================================================

-- ── Tabela de estado de alertas ──────────────────────────────
-- Mantém um registro por sensor_id indicando se cada alerta
-- já está ativo. Evita spam: notificação só sai na transição.

CREATE TABLE IF NOT EXISTS sensor_alertas (
  sensor_id        TEXT        PRIMARY KEY,
  em_offline       BOOLEAN     NOT NULL DEFAULT FALSE,
  em_bateria_baixa BOOLEAN     NOT NULL DEFAULT FALSE,
  em_wifi_fraco    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: leitura pública, escrita só pelo service_role da Edge Function.
ALTER TABLE sensor_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_select_public"
  ON sensor_alertas
  FOR SELECT
  USING (true);

-- ── pg_cron: roda telegram-watchdog a cada 5 minutos ─────────
-- pg_net envia POST para a Edge Function (sem JWT — verify_jwt: false).
-- Substitua <PROJECT_REF> pelo ref do seu projeto se necessário
-- (o valor correto já está preenchido abaixo para este projeto).

SELECT cron.schedule(
  'telegram-watchdog',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ndcslvrjlmbanrqbwifn.supabase.co/functions/v1/telegram-watchdog',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
