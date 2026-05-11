-- ============================================================
--  GRAUCONST — Estrutura do banco de dados
--  Execute no Editor SQL do Supabase
--
--  Para banco JÁ EXISTENTE (migração da v1 para v2 com umidade):
--    ALTER TABLE sensor_leituras
--      ADD COLUMN IF NOT EXISTS umidade NUMERIC(5,2);
--    ALTER TABLE sensor_leituras
--      ADD CONSTRAINT sensor_leituras_temperatura_check
--        CHECK (temperatura BETWEEN -40 AND 80);
--    ALTER TABLE sensor_leituras
--      ADD CONSTRAINT sensor_leituras_umidade_check
--        CHECK (umidade IS NULL OR umidade BETWEEN 0 AND 100);
-- ============================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS sensor_leituras (
  id            BIGSERIAL    PRIMARY KEY,
  sensor_id     TEXT         NOT NULL DEFAULT 'DHT22-01',
  temperatura   NUMERIC(5,2) NOT NULL
                 CHECK (temperatura BETWEEN -40 AND 80),
  umidade       NUMERIC(5,2)
                 CHECK (umidade IS NULL OR umidade BETWEEN 0 AND 100),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Índice por tempo
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_created_at
  ON sensor_leituras (created_at DESC);

-- 3. Índice por sensor
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_sensor_id
  ON sensor_leituras (sensor_id, created_at DESC);

-- 4. Row Level Security
ALTER TABLE sensor_leituras ENABLE ROW LEVEL SECURITY;

-- 5. Leitura pública (dashboard)
DROP POLICY IF EXISTS "Leitura pública" ON sensor_leituras;
CREATE POLICY "Leitura pública"
  ON sensor_leituras FOR SELECT
  USING (true);

-- 6. Inserção via anon key (ESP32)
-- NOTA: policy permissiva. Para produção real, considere autenticação JWT
-- ou Edge Function intermediária com service_role key.
DROP POLICY IF EXISTS "Inserção via anon key" ON sensor_leituras;
CREATE POLICY "Inserção via anon key"
  ON sensor_leituras FOR INSERT
  WITH CHECK (true);

-- 7. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sensor_leituras;

-- Para inserir dados de teste, rode `seed.sql` separadamente.
