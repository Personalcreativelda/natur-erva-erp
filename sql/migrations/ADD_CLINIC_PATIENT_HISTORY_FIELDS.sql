-- ====================================================================
-- ADD_CLINIC_PATIENT_HISTORY_FIELDS.sql — Ficha do paciente (identificação)
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_CLINIC_PATIENT_HISTORY_FIELDS.sql
-- ====================================================================

ALTER TABLE clinic_patients ADD COLUMN IF NOT EXISTS file_number SERIAL;
ALTER TABLE clinic_patients ADD COLUMN IF NOT EXISTS birth_date  DATE;
ALTER TABLE clinic_patients ADD COLUMN IF NOT EXISTS sex         VARCHAR(20);
ALTER TABLE clinic_patients ADD COLUMN IF NOT EXISTS profession  VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_patients_file_number_idx ON clinic_patients(file_number);

SELECT '✅ Ficha do paciente: campos de identificação adicionados' AS status;
