-- ====================================================================
-- ADD_PAYROLL_MZ_STANDARD.sql — Payroll ao padrão oficial de Moçambique
-- (Folha de Relação Nominal / e-FRN, Lei do Trabalho 13/2023 art. 122)
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_PAYROLL_MZ_STANDARD.sql
-- ====================================================================

-- Parâmetros de configuração do payroll (linha única, editável pelo admin)
CREATE TABLE IF NOT EXISTS payroll_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  year                  INTEGER NOT NULL DEFAULT 2026,
  normal_hours_month    DECIMAL(6,2) NOT NULL DEFAULT 208,
  hours_per_day         DECIMAL(5,2) NOT NULL DEFAULT 8,
  inss_employee_rate    DECIMAL(5,2) NOT NULL DEFAULT 3,
  inss_employer_rate    DECIMAL(5,2) NOT NULL DEFAULT 4,
  overtime_50_rate      DECIMAL(5,2) NOT NULL DEFAULT 50,   -- HE até 24h — Lei 13/2023 art. 122
  overtime_100_rate     DECIMAL(5,2) NOT NULL DEFAULT 100,  -- HE nocturna/além limite — Lei 13/2023 art. 122
  night_work_rate       DECIMAL(5,2) NOT NULL DEFAULT 25,   -- Trabalho nocturno — Lei 13/2023 art. 122
  union_fee_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,    -- Taxa sindical padrão
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO payroll_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Linhas de remuneração/desconto/horas exigidas pelo "Recibo de Salário — Modelo" oficial
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS base_salary        DECIMAL(12,2) NOT NULL DEFAULT 0; -- Salário fixo (gross_salary passa a ser o Bruto Total = soma de tudo)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS commissions        DECIMAL(12,2) NOT NULL DEFAULT 0; -- Comissões
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS variable_bonus     DECIMAL(12,2) NOT NULL DEFAULT 0; -- Variável/Bónus
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS allowances         DECIMAL(12,2) NOT NULL DEFAULT 0; -- Subsídios/Abonos

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS overtime_hours_50  DECIMAL(6,2) NOT NULL DEFAULT 0; -- Horas extra (+50%)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS overtime_hours_100 DECIMAL(6,2) NOT NULL DEFAULT 0; -- Horas extra (+100%)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS night_hours        DECIMAL(6,2) NOT NULL DEFAULT 0; -- Horas nocturnas (+25%)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS overtime_amount    DECIMAL(12,2) NOT NULL DEFAULT 0; -- Horas extra, em MT (soma +50%/+100%)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS night_amount       DECIMAL(12,2) NOT NULL DEFAULT 0; -- Adicional nocturno, em MT

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS union_fee          DECIMAL(12,2) NOT NULL DEFAULT 0; -- Taxa sindical, em MT
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS advances           DECIMAL(12,2) NOT NULL DEFAULT 0; -- Adiantamentos

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS absence_hours_justified   DECIMAL(6,2) NOT NULL DEFAULT 0; -- Horas ausência justificada
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS absence_hours_unjustified DECIMAL(6,2) NOT NULL DEFAULT 0; -- Horas ausência injustificada
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS absence_days_unpaid       DECIMAL(5,2) NOT NULL DEFAULT 0; -- Dias de falta não remunerada
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_hours                DECIMAL(6,2) NOT NULL DEFAULT 0; -- Atrasos (h)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS absence_amount            DECIMAL(12,2) NOT NULL DEFAULT 0; -- Desconto de absentismo, em MT
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS employer_cost             DECIMAL(12,2) NOT NULL DEFAULT 0; -- Custo total para a empresa (bruto + INSS entidade)

SELECT '✅ Payroll ao padrão de Moçambique: config e novas linhas do recibo criadas' AS status;
