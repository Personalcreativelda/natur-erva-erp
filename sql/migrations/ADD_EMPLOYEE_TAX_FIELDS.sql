-- ====================================================================
-- ADD_EMPLOYEE_TAX_FIELDS.sql — Isenções de INSS/IRPS e taxa de INSS por funcionário
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_EMPLOYEE_TAX_FIELDS.sql
-- ====================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS inss_exempt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS irps_exempt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS inss_rate   DECIMAL(5,2); -- NULL = usar 3% padrão
ALTER TABLE employees ADD COLUMN IF NOT EXISTS irps_rate   DECIMAL(5,2); -- NULL = usar tabela progressiva

SELECT '✅ Campos de isenção/taxa de INSS e IRPS adicionados a employees' AS status;
