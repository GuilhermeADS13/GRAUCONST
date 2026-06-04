-- ============================================================
--  GRAUCONST — Estrutura do banco de dados
--  Execute no Editor SQL do Supabase
--
--  Para banco JÁ EXISTENTE, rode apenas os ALTERs necessários:
--    ALTER TABLE sensor_leituras
--      ADD COLUMN IF NOT EXISTS umidade      NUMERIC(5,2),
--      ADD COLUMN IF NOT EXISTS bateria_pct  SMALLINT,
--      ADD COLUMN IF NOT EXISTS rssi         INT,
--      ADD COLUMN IF NOT EXISTS inkbird_temp NUMERIC(5,2),
--      ADD COLUMN IF NOT EXISTS inkbird_hum  NUMERIC(5,2),
--      ADD COLUMN IF NOT EXISTS inkbird_bat  SMALLINT;
-- ============================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS sensor_leituras (
  id            BIGSERIAL    PRIMARY KEY,
  sensor_id     TEXT         NOT NULL DEFAULT 'DHT22-01',
  temperatura   NUMERIC(5,2) NOT NULL
                 CHECK (temperatura BETWEEN -40 AND 80),
  umidade       NUMERIC(5,2)
                 CHECK (umidade IS NULL OR umidade BETWEEN 0 AND 100),
  bateria_pct   SMALLINT
                 CHECK (bateria_pct IS NULL OR bateria_pct BETWEEN 0 AND 100),
  rssi          INT
  CHECK (rssi IS NULL OR rssi BETWEEN -120 AND 0),
  inkbird_temp  NUMERIC(5,2),
  inkbird_hum   NUMERIC(5,2),
  inkbird_bat   SMALLINT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sensor_leituras IS
  'Leituras dos sensores ambientais. INSERTs vão pelo Edge Function sensor-ingest (service_role). SELECT é público para alimentar o dashboard.';
COMMENT ON COLUMN sensor_leituras.sensor_id   IS 'Identificador único do dispositivo.';
COMMENT ON COLUMN sensor_leituras.bateria_pct IS 'Porcentagem da bateria LiPo (0-100%). Calculada no ESP32 a partir da tensão.';
COMMENT ON COLUMN sensor_leituras.rssi        IS 'Força do sinal WiFi em dBm (-100 fraco, -30 excelente).';

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_created_at
  ON sensor_leituras (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_leituras_sensor_id
  ON sensor_leituras (sensor_id, created_at DESC);

-- 3. Row Level Security
ALTER TABLE sensor_leituras ENABLE ROW LEVEL SECURITY;

-- 4. Leitura pública (dashboard)
DROP POLICY IF EXISTS "Leitura pública" ON sensor_leituras;
CREATE POLICY "Leitura pública"
  ON sensor_leituras FOR SELECT
  USING (true);

-- 5. INSERT: nenhuma policy.
--    Com RLS ativo e sem policy de INSERT, anon/authenticated NÃO conseguem
--    inserir. Apenas service_role (usado pelo Edge Function sensor-ingest)
--    bypassa RLS. Isso impede falsificação de dados via chave pública.

-- 6. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sensor_leituras;

-- ============================================================
--  Retenção automática (90 dias) via pg_cron
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_sensor_leituras_90d') THEN
    PERFORM cron.schedule(
      'prune_sensor_leituras_90d',
      '0 3 * * *',
      $cmd$DELETE FROM public.sensor_leituras WHERE created_at < NOW() - INTERVAL '90 days'$cmd$
    );
  END IF;
END $$;

-- ============================================================
--  Tabelas de alertas (telegram-watchdog)
-- ============================================================

-- Estado atual dos alertas por sensor (upsert a cada check do watchdog)
CREATE TABLE IF NOT EXISTS sensor_alertas (
  sensor_id        TEXT        PRIMARY KEY,
  em_offline       BOOLEAN     NOT NULL DEFAULT false,
  em_bateria_baixa BOOLEAN     NOT NULL DEFAULT false,
  em_wifi_fraco    BOOLEAN     NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sensor_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública alertas" ON sensor_alertas;
CREATE POLICY "Leitura pública alertas"
  ON sensor_alertas FOR SELECT
  USING (true);

-- Cooldown para evitar alertas repetidos em curto intervalo
CREATE TABLE IF NOT EXISTS alerta_cooldown (
  id         BIGSERIAL    PRIMARY KEY,
  sensor_id  TEXT         NOT NULL,
  tipo       TEXT         NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE alerta_cooldown ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alerta_cooldown_sensor_tipo
  ON alerta_cooldown (sensor_id, tipo, created_at DESC);

-- Para inserir dados de teste, rode `seed.sql` separadamente.
