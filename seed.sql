-- ============================================================
--  GRAUCONST — Dados de exemplo (somente desenvolvimento)
--  Execute APÓS sql_setup.sql para popular o dashboard com dados.
-- ============================================================

INSERT INTO sensor_leituras (sensor_id, temperatura, umidade, created_at) VALUES
  ('DHT22-01', 22.5, 58.0, NOW() - INTERVAL '23 hours'),
  ('DHT22-01', 23.1, 57.2, NOW() - INTERVAL '21 hours'),
  ('DHT22-01', 24.8, 55.5, NOW() - INTERVAL '19 hours'),
  ('DHT22-01', 26.3, 52.1, NOW() - INTERVAL '17 hours'),
  ('DHT22-01', 27.9, 49.8, NOW() - INTERVAL '15 hours'),
  ('DHT22-01', 29.2, 47.0, NOW() - INTERVAL '13 hours'),
  ('DHT22-01', 28.5, 48.3, NOW() - INTERVAL '11 hours'),
  ('DHT22-01', 27.1, 50.6, NOW() - INTERVAL '9 hours'),
  ('DHT22-01', 25.6, 53.4, NOW() - INTERVAL '7 hours'),
  ('DHT22-01', 24.9, 55.0, NOW() - INTERVAL '5 hours'),
  ('DHT22-01', 24.2, 56.2, NOW() - INTERVAL '3 hours'),
  ('DHT22-01', 23.8, 57.5, NOW() - INTERVAL '1 hour'),
  ('DHT22-01', 23.5, 58.1, NOW() - INTERVAL '15 minutes');
