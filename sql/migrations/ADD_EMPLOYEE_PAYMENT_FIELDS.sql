-- ====================================================================
-- ADD_EMPLOYEE_PAYMENT_FIELDS.sql — Dados de pagamento do funcionário (banco/NIB/conta, M-Pesa, Emola)
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_EMPLOYEE_PAYMENT_FIELDS.sql
-- ====================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'bank'; -- bank | mpesa | emola | cash
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name     VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_nib      VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account  VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mpesa_number  VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emola_number  VARCHAR(20);

SELECT '✅ Campos de pagamento adicionados a employees' AS status;
