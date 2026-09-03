-- ====================================================================
-- CREATE_ASSISTANT_CONFIG.sql — Assistente de IA via WhatsApp (Fase 1: só consulta)
-- Run: cd backend && node run-migration.js ../sql/migrations/CREATE_ASSISTANT_CONFIG.sql
-- ====================================================================

CREATE TABLE IF NOT EXISTS assistant_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled            BOOLEAN NOT NULL DEFAULT false,

  -- Evolution API
  evolution_base_url    VARCHAR(255),
  evolution_instance    VARCHAR(100),
  evolution_api_key     VARCHAR(255),
  webhook_secret        VARCHAR(100) NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- IA (OpenAI ou Anthropic)
  llm_provider          VARCHAR(20) CHECK (llm_provider IN ('openai','anthropic')),
  llm_api_key           VARCHAR(255),
  llm_model             VARCHAR(100),

  authorized_numbers    TEXT[],

  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO assistant_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Histórico curto de conversas por número (contexto para o LLM + auditoria)
CREATE TABLE IF NOT EXISTS assistant_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        VARCHAR(30) NOT NULL,
  role         VARCHAR(10) NOT NULL CHECK (role IN ('user','assistant')),
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assistant_messages_phone_idx ON assistant_messages(phone, created_at DESC);

-- Controla quando cada produto foi notificado por stock baixo pela última vez (evita repetir o aviso a cada corrida do cron)
CREATE TABLE IF NOT EXISTS assistant_stock_alerts (
  product_id       UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT '✅ Assistente WhatsApp: tabelas criadas' AS status;
