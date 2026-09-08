-- ====================================================================
-- ADD_EMPLOYEE_DEMOGRAPHICS.sql — campos exigidos pela "Folha de Relação
-- Nominal de Trabalhadores" (modelo oficial de Moçambique).
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_EMPLOYEE_DEMOGRAPHICS.sql
-- ====================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS sexo VARCHAR(1);       -- 'M' ou 'F'
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date DATE;       -- Data de Nascimento

SELECT '✅ Campos sexo e data de nascimento adicionados aos funcionários' AS status;
