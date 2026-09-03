-- ====================================================================
-- CREATE_CLINIC_MODULE.sql — Módulo Clínica (Saúde e Bem-Estar)
-- Run: cd backend && node run-migration.js ../sql/migrations/CREATE_CLINIC_MODULE.sql
-- ====================================================================

-- ── Pacientes (extensão clínica de um customer) ──────────────────────
CREATE TABLE IF NOT EXISTS clinic_patients (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID          NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,

  health_history  JSONB         NOT NULL DEFAULT '{}',
  allergies       TEXT,
  consent_at      TIMESTAMPTZ,
  consent_version VARCHAR(20),

  is_active       BOOLEAN       NOT NULL DEFAULT true,
  notes           TEXT,

  created_by      UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinic_patients_customer_idx ON clinic_patients(customer_id);
CREATE INDEX IF NOT EXISTS clinic_patients_active_idx   ON clinic_patients(is_active);

-- ── Ficha clínica (registos por área) ────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_records (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID          NOT NULL REFERENCES clinic_patients(id) ON DELETE CASCADE,

  area        VARCHAR(40)   NOT NULL
              CHECK (area IN ('consulta_integrativa','bioressonancia','nutricao_integrativa','fitoterapia_suplementacao','educacao_saude')),
  record_type VARCHAR(50)   NOT NULL DEFAULT 'nota',
  summary     TEXT,
  data        JSONB         NOT NULL DEFAULT '{}',
  attachments JSONB         NOT NULL DEFAULT '[]',

  author_id   UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinical_records_patient_idx ON clinical_records(patient_id);
CREATE INDEX IF NOT EXISTS clinical_records_area_idx    ON clinical_records(area);
CREATE INDEX IF NOT EXISTS clinical_records_created_idx ON clinical_records(created_at DESC);

-- ── Agenda de acompanhamento ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_appointments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID          NOT NULL REFERENCES clinic_patients(id) ON DELETE CASCADE,
  therapist_id     UUID          REFERENCES profiles(id) ON DELETE SET NULL,

  area             VARCHAR(40)   NOT NULL
                   CHECK (area IN ('consulta_integrativa','bioressonancia','nutricao_integrativa','fitoterapia_suplementacao','educacao_saude')),
  scheduled_at     TIMESTAMPTZ   NOT NULL,
  duration_minutes INTEGER       NOT NULL DEFAULT 60,
  status           VARCHAR(20)   NOT NULL DEFAULT 'agendado'
                   CHECK (status IN ('agendado','confirmado','concluido','cancelado','faltou')),
  location_id      UUID          REFERENCES locations(id) ON DELETE SET NULL,
  notes            TEXT,

  created_by       UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinic_appointments_patient_idx     ON clinic_appointments(patient_id);
CREATE INDEX IF NOT EXISTS clinic_appointments_therapist_idx   ON clinic_appointments(therapist_id);
CREATE INDEX IF NOT EXISTS clinic_appointments_scheduled_idx   ON clinic_appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS clinic_appointments_status_idx      ON clinic_appointments(status);

-- ── Protocolos (fitoterapia / suplementação) ──────────────────────────
CREATE TABLE IF NOT EXISTS clinic_protocols (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID          NOT NULL REFERENCES clinic_patients(id) ON DELETE CASCADE,

  area           VARCHAR(40)   NOT NULL
                 CHECK (area IN ('consulta_integrativa','bioressonancia','nutricao_integrativa','fitoterapia_suplementacao','educacao_saude')),
  title          VARCHAR(150)  NOT NULL,
  prescribed_by  UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  start_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  end_date       DATE,
  status         VARCHAR(20)   NOT NULL DEFAULT 'ativo'
                 CHECK (status IN ('ativo','concluido','suspenso')),
  notes          TEXT,

  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinic_protocols_patient_idx ON clinic_protocols(patient_id);
CREATE INDEX IF NOT EXISTS clinic_protocols_status_idx  ON clinic_protocols(status);

-- ── Itens do protocolo (ligados a produtos/suplementos) ───────────────
CREATE TABLE IF NOT EXISTS clinic_protocol_items (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id            UUID          NOT NULL REFERENCES clinic_protocols(id) ON DELETE CASCADE,
  product_id             UUID          REFERENCES products(id) ON DELETE SET NULL,

  dosage_text            VARCHAR(200),
  frequency_text         VARCHAR(200),
  quantity_per_dispense  INTEGER       NOT NULL DEFAULT 1,

  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinic_protocol_items_protocol_idx ON clinic_protocol_items(protocol_id);
CREATE INDEX IF NOT EXISTS clinic_protocol_items_product_idx  ON clinic_protocol_items(product_id);

SELECT '✅ Módulo Clínica: tabelas criadas' AS status;
