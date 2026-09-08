-- ====================================================================
-- ADD_COMMISSION_GOAL_TYPES.sql — Sistema de Comissões do Staff (proposta do cliente, 04/09/2026)
-- Acrescenta 2 novos tipos de meta a staff_incentive_goals:
--   - daily_category_commission: comissão % sobre o valor total vendido numa categoria
--     de produtos (ex: suplementos), só nos dias em que a meta diária de unidades é atingida.
--   - service_commission: comissão % sobre cada fatura da Clínica paga que inclua um
--     serviço específico (ex: Check-up Bem-Estar).
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_COMMISSION_GOAL_TYPES.sql
-- ====================================================================

ALTER TABLE staff_incentive_goals ALTER COLUMN type TYPE VARCHAR(40);
ALTER TABLE staff_incentive_goals ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE staff_incentive_goals ADD COLUMN IF NOT EXISTS min_daily_units INTEGER;
ALTER TABLE staff_incentive_goals ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2);
ALTER TABLE staff_incentive_goals ADD COLUMN IF NOT EXISTS clinic_service_id UUID REFERENCES clinic_services(id) ON DELETE SET NULL;

ALTER TABLE staff_incentive_goals DROP CONSTRAINT IF EXISTS staff_incentive_goals_type_check;
ALTER TABLE staff_incentive_goals ADD CONSTRAINT staff_incentive_goals_type_check
  CHECK (type IN ('unit_threshold','promoter_target','daily_category_commission','service_commission'));

SELECT '✅ Sistema de Comissões do Staff: novos tipos de meta adicionados' AS status;
