-- ============================================================
--  GRAUCONST — Estrutura do banco de dados
--  Execute no Editor SQL do Supabase
-- ============================================================

-- 1. Tabela principal de leituras dos sensores
CREATE TABLE IF NOT EXISTS sensor_leituras (
  id            BIGSERIAL PRIMARY KEY,
  sensor_id     TEXT        NOT NULL DEFAULT 'DHT22-01',
  temperatura   NUMERIC(5,2) NOT NULL,
  umidade       NUMERIC(5,2) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Índice para consultas por tempo (gráfico 24h)
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_created_at
  ON sensor_leituras (created_at DESC);

-- 3. Índice por sensor_id
CREATE INDEX IF NOT EXISTS idx_sensor_leituras_sensor_id
  ON sensor_leituras (sensor_id, created_at DESC);

-- 4. Habilitar Row Level Security
ALTER TABLE sensor_leituras ENABLE ROW LEVEL SECURITY;

-- 5. Política: leitura pública (dashboard sem login)
CREATE POLICY "Leitura pública"
  ON sensor_leituras FOR SELECT
  USING (true);

-- 6. Política: inserção via anon key (ESP32)
CREATE POLICY "Inserção via anon key"
  ON sensor_leituras FOR INSERT
  WITH CHECK (true);

-- 7. Habilitar Realtime na tabela
ALTER PUBLICATION supabase_realtime ADD TABLE sensor_leituras;

-- 8. Dados de teste (opcional — remova em produção)
INSERT INTO sensor_leituras (sensor_id, temperatura, umidade, created_at) VALUES
  ('DHT22-01', 24.5, 62.0, NOW() - INTERVAL '23 hours'),
  ('DHT22-01', 25.1, 60.5, NOW() - INTERVAL '21 hours'),
  ('DHT22-01', 26.3, 58.2, NOW() - INTERVAL '19 hours'),
  ('DHT22-01', 27.8, 55.0, NOW() - INTERVAL '17 hours'),
  ('DHT22-01', 28.4, 53.5, NOW() - INTERVAL '15 hours'),
  ('DHT22-01', 29.1, 51.0, NOW() - INTERVAL '13 hours'),
  ('DHT22-01', 27.6, 54.3, NOW() - INTERVAL '11 hours'),
  ('DHT22-01', 26.9, 57.1, NOW() - INTERVAL '9 hours'),
  ('DHT22-01', 25.8, 59.8, NOW() - INTERVAL '7 hours'),
  ('DHT22-01', 25.2, 61.2, NOW() - INTERVAL '5 hours'),
  ('DHT22-01', 24.8, 63.0, NOW() - INTERVAL '3 hours'),
  ('DHT22-01', 24.3, 64.5, NOW() - INTERVAL '1 hour'),
  ('DHT22-01', 24.1, 65.0, NOW() - INTERVAL '15 minutes');
