-- ============================================================
-- Migration: Sistema de Alertas + Watchdog (Telegram)
--
-- Pré-requisitos:
--   - Edge Function `telegram-alert` deployada com verify_jwt=false
--   - Secrets TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALERTA_*
-- ============================================================

-- ── 1. Tabela de cooldown ────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerta_cooldown (
  id          BIGSERIAL PRIMARY KEY,
  sensor_id   TEXT        NOT NULL,
  tipo        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerta_cooldown_sensor_tipo
  ON alerta_cooldown (sensor_id, tipo, created_at DESC);

ALTER TABLE alerta_cooldown ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role only" ON alerta_cooldown;
CREATE POLICY "service_role only"
  ON alerta_cooldown
  USING (auth.role() = 'service_role');

-- ── 2. Limpeza diária dos cooldowns ──────────────────────────
SELECT cron.schedule(
  'limpar-alerta-cooldown',
  '0 * * * *',
  $$DELETE FROM alerta_cooldown WHERE created_at < NOW() - INTERVAL '24 hours'$$
);

-- ── 3. Watchdog: a cada 15 min, para cada sensor ativo nas
--    últimas 24h, dispara alerta se silêncio > 15 min.
-- ============================================================
SELECT cron.schedule(
  'watchdog-sensor',
  '*/15 * * * *',
  $WATCHDOG$
  DO $INNER$
  DECLARE
    s              RECORD;
    silencio_min   INT  := 15;
    alerta_url     TEXT := 'https://ndcslvrjlmbanrqbwifn.supabase.co/functions/v1/telegram-alert';
    ja_alertado    BOOLEAN;
  BEGIN
    FOR s IN
      SELECT sensor_id, MAX(created_at) AS ultima
      FROM sensor_leituras
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY sensor_id
    LOOP
      IF s.ultima < NOW() - (silencio_min || ' minutes')::INTERVAL THEN
        SELECT EXISTS (
          SELECT 1 FROM alerta_cooldown
          WHERE sensor_id = s.sensor_id
            AND tipo = 'watchdog'
            AND created_at > NOW() - INTERVAL '30 minutes'
        ) INTO ja_alertado;

        IF NOT ja_alertado THEN
          INSERT INTO alerta_cooldown (sensor_id, tipo) VALUES (s.sensor_id, 'watchdog');
          PERFORM net.http_post(
            url := alerta_url,
            headers := '{"Content-Type":"application/json"}'::jsonb,
            body := jsonb_build_object('tipo', 'watchdog', 'sensor_id', s.sensor_id)
          );
        END IF;
      END IF;
    END LOOP;
  END;
  $INNER$ LANGUAGE plpgsql;
  $WATCHDOG$
);

-- ── 4. Conferir crons ────────────────────────────────────────
-- SELECT jobid, jobname, schedule, active FROM cron.job;
