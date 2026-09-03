-- ====================================================================
-- ADD_GEMINI_PROVIDER.sql — adiciona 'gemini' como fornecedor de IA válido
-- Run: cd backend && node run-migration.js ../sql/migrations/ADD_GEMINI_PROVIDER.sql
-- ====================================================================

ALTER TABLE assistant_config DROP CONSTRAINT IF EXISTS assistant_config_llm_provider_check;
ALTER TABLE assistant_config ADD CONSTRAINT assistant_config_llm_provider_check
  CHECK (llm_provider IN ('openai', 'anthropic', 'gemini'));

SELECT '✅ Fornecedor Gemini adicionado à configuração do assistente' AS status;
