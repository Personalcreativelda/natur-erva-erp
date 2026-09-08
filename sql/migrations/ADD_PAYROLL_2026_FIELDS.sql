-- ====================================================================
-- ADD_PAYROLL_2026_FIELDS.sql — campos necessários para a tabela oficial
-- de IRPS 2026 (por escalão + dependentes) e para a Folha de INSS —
-- Relação Nominal Mensal no formato do modelo do governo.
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_PAYROLL_2026_FIELDS.sql
-- ====================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS dependents_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS inss_number VARCHAR(30);

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS worked_days INTEGER;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS inss_base DECIMAL(12,2);

SELECT '✅ Campos do payroll 2026 (dependentes, N.º INSS, dias trabalhados, base INSS) adicionados' AS status;
