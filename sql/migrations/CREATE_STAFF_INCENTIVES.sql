-- ====================================================================
-- CREATE_STAFF_INCENTIVES.sql — Metas & Bónus para staff interno (caixa/POS)
-- Run: cd backend && node run-migration.js ../sql/migrations/CREATE_STAFF_INCENTIVES.sql
-- ====================================================================

CREATE TABLE IF NOT EXISTS staff_incentive_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('unit_threshold','promoter_target')),

  -- unit_threshold: a cada N unidades vendidas de um produto, 1 unidade vira bónus
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  every_n_units   INTEGER,

  -- promoter_target: meta de valor vendido no período; tudo-ou-nada
  target_value    DECIMAL(12,2),
  base_amount     DECIMAL(12,2),
  full_amount     DECIMAL(12,2),

  employee_ids    INTEGER[],           -- IDs de employees.id (INTEGER, não UUID) — NULL/vazio = aplica-se a todo o staff interno
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,

  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_incentive_goals_active_idx  ON staff_incentive_goals(is_active);
CREATE INDEX IF NOT EXISTS staff_incentive_goals_product_idx ON staff_incentive_goals(product_id);

SELECT '✅ Metas & Bónus: tabela staff_incentive_goals criada' AS status;
