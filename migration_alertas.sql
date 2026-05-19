-- ============================================================
-- Migration: Sistema de Alertas + Watchdog
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Tabela de cooldown de alertas (evita spam no Telegram)
CREATE TABLE IF NOT EXISTS alerta_cooldown (
  id          BIGSERIAL PRIMARY KEY,
  sensor_id   TEXT        NOT NULL,
  tipo        TEXT        NOT NULL,  -- temp_baixa | temp_alta | wifi_fraco | watchdog
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consulta rápida
CREATE INDEX IF NOT EXISTS idx_alerta_cooldown_sensor_tipo
  ON alerta_cooldown (sensor_id, tipo, created_at DESC);

-- Limpeza automática: remove alertas com mais de 24h (evita crescimento infinito)
SELECT cron.schedule(
  'limpar-alerta-cooldown',
  '0 * * * *',  -- todo hora
  $$DELETE FROM alerta_cooldown WHERE created_at < NOW() - INTERVAL '24 hours'$$
);

-- ============================================================
-- 2. Watchdog via pg_cron — roda a cada 15 minutos
-- Verifica se o sensor ficou em silêncio e dispara alerta
-- ============================================================
SELECT cron.schedule(
  'watchdog-sensor',
  '*/15 * * * *',
  $$
  DO $$
  DECLARE
    ultima_leitura TIMESTAMPTZ;
    sensor         TEXT := 'DHT22-01';
    silencio_min   INT  := 15;
    alerta_url     TEXT := current_setting('app.supabase_url') || '/functions/v1/telegram-alert';
    service_key    TEXT := current_setting('app.service_role_key');
    ja_alertado    BOOLEAN;
  BEGIN
    -- Pega a última leitura do sensor
    SELECT MAX(created_at) INTO ultima_leitura
    FROM sensor_leituras
    WHERE sensor_id = sensor;

    -- Se nunca teve leitura ou passou do tempo limite
    IF ultima_leitura IS NULL OR ultima_leitura < NOW() - (silencio_min || ' minutes')::INTERVAL THEN

      -- Verifica cooldown (não alertar se já alertou nos últimos 30 min)
      SELECT EXISTS (
        SELECT 1 FROM alerta_cooldown
        WHERE sensor_id = sensor
          AND tipo = 'watchdog'
          AND created_at > NOW() - INTERVAL '30 minutes'
      ) INTO ja_alertado;

      IF NOT ja_alertado THEN
        -- Registra cooldown
        INSERT INTO alerta_cooldown (sensor_id, tipo) VALUES (sensor, 'watchdog');

        -- Dispara alerta via Edge Function
        PERFORM net.http_post(
          url := alerta_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := jsonb_build_object(
            'tipo', 'watchdog',
            'sensor_id', sensor
          )
        );
      END IF;

    ELSE
      -- Sensor voltou? Limpa cooldown de watchdog para poder alertar na próxima ausência
      DELETE FROM alerta_cooldown
      WHERE sensor_id = sensor AND tipo = 'watchdog'
        AND created_at < NOW() - INTERVAL '16 minutes';
    END IF;
  END;
  $$ LANGUAGE plpgsql;
  $$
);

-- ============================================================
-- 3. Configurar variáveis de app para o pg_cron acessar
-- (substituir pelos valores reais do seu projeto Supabase)
-- ============================================================
-- ALTER DATABASE postgres SET app.supabase_url = 'https://SEU_ID.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'sua_service_role_key';

-- ============================================================
-- 4. RLS na tabela alerta_cooldown (só service_role acessa)
-- ============================================================
ALTER TABLE alerta_cooldown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only"
  ON alerta_cooldown
  USING (auth.role() = 'service_role');

-- ============================================================
-- VERIFICAR se pg_cron está habilitado:
-- SELECT * FROM cron.job;
-- ============================================================
