-- Adicionar coluna bateria_pct (porcentagem 0-100)
-- Execute no Editor SQL do Supabase se a tabela já existir

ALTER TABLE sensor_leituras
  ADD COLUMN IF NOT EXISTS bateria_pct SMALLINT CHECK (bateria_pct >= 0 AND bateria_pct <= 100);

-- Comentário
COMMENT ON COLUMN sensor_leituras.bateria_pct IS 'Porcentagem da bateria LiPo (0-100%)';
