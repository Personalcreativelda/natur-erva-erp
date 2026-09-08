-- ====================================================================
-- CREATE_CLINIC_BILLING.sql — Precificação e faturação própria da Clínica
-- Tabelas isoladas do resto do sistema (não tocam em products/invoices/orders).
-- Run: cd backend && node run-migration.js ../sql/migrations/CREATE_CLINIC_BILLING.sql
-- ====================================================================

CREATE TABLE IF NOT EXISTS clinic_services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(150) NOT NULL UNIQUE,
  type             VARCHAR(20) NOT NULL CHECK (type IN ('servico','pacote')),
  duration_minutes INTEGER,
  price            DECIMAL(12,2) NOT NULL,
  includes         TEXT,           -- descrição do que inclui (usado sobretudo em pacotes)
  is_active        BOOLEAN NOT NULL DEFAULT true,
  display_order    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinic_services_active_idx ON clinic_services(is_active);

CREATE TABLE IF NOT EXISTS clinic_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(30) NOT NULL UNIQUE,

  patient_id       UUID REFERENCES clinic_patients(id) ON DELETE SET NULL,  -- opcional: nem todo cliente é paciente com ficha clínica
  customer_name    VARCHAR(150) NOT NULL,
  customer_phone   VARCHAR(30),

  items            JSONB NOT NULL DEFAULT '[]',   -- [{ serviceId, name, quantity, unitPrice }]
  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  total            DECIMAL(12,2) NOT NULL DEFAULT 0,

  status           VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  payment_method   VARCHAR(30),
  notes            TEXT,

  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinic_invoices_patient_idx ON clinic_invoices(patient_id);
CREATE INDEX IF NOT EXISTS clinic_invoices_status_idx  ON clinic_invoices(status);
CREATE INDEX IF NOT EXISTS clinic_invoices_created_idx ON clinic_invoices(created_at DESC);

-- ── Semente: tabela de preços dada pelo cliente como proposta ──────────────

INSERT INTO clinic_services (name, type, duration_minutes, price, includes, display_order) VALUES
  ('Avaliação de bem-estar por biorressonância', 'servico', 40, 750.00,  NULL, 10),
  ('Reavaliação por biorressonância',            'servico', 25, 500.00,  NULL, 20),
  ('Consulta inicial de nutrição com plano alimentar', 'servico', 60, 1500.00, NULL, 30),
  ('Consulta de seguimento nutricional',         'servico', 38, 1000.00, NULL, 40),
  ('Consulta individual de psicologia',          'servico', 55, 1500.00, NULL, 50),
  ('Consulta psicológica de casal',              'servico', 68, 2500.00, NULL, 60),
  ('Massagem relaxante',                         'servico', 30, 750.00,  NULL, 70),
  ('Massagem relaxante corporal',                'servico', 60, 1500.00, NULL, 80),
  ('Massagem terapêutica',                       'servico', 60, 1800.00, NULL, 90),
  ('Massagem de costas, pescoço e ombros',       'servico', 30, 900.00,  NULL, 100),
  ('Reflexologia dos pés',                       'servico', 40, 1000.00, NULL, 110),
  ('Foot Detox',                                 'servico', 35, 750.00,  NULL, 120),
  ('Ventosaterapia localizada',                  'servico', 35, 1000.00, NULL, 130),
  ('Drenagem linfática manual',                  'servico', 60, 2000.00, NULL, 140),
  ('Massagem com pedras quentes',                'servico', 60, 2000.00, NULL, 150),
  ('Terapia combinada personalizada',            'servico', 60, 2000.00, NULL, 160),

  ('Check-up Bem-Estar',      'pacote', NULL, 1000.00, 'Biorressonância + orientação geral', 200),
  ('Nutrição Completa',       'pacote', NULL, 2000.00, 'Biorressonância + consulta nutricional + plano alimentar', 210),
  ('Relaxamento',             'pacote', NULL, 2200.00, 'Massagem de 60 min. + reflexologia', 220),
  ('Detox & Bem-Estar',       'pacote', NULL, 1250.00, 'Foot Detox + massagem de 30 min.', 230),
  ('Programa Nutricional Mensal', 'pacote', NULL, 3000.00, 'Consulta inicial + 2 seguimentos', 240),
  ('Programa Psicológico',    'pacote', NULL, 5500.00, '4 sessões individuais', 250),
  ('Programa Terapêutico',    'pacote', NULL, 6500.00, '4 massagens terapêuticas', 260)
ON CONFLICT (name) DO NOTHING;

SELECT '✅ Clínica: precificação e faturação criadas e semeadas' AS status;
