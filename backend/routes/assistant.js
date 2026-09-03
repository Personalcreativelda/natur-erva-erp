import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendEvolutionMessage, handleIncomingMessage } from '../services/assistantService.js';

const router = express.Router();

// Só o Super Administrador pode ver/alterar credenciais de integrações (Evolution API, chave de IA)
function requireSuperAdmin(req, res, next) {
  const roles = [...(Array.isArray(req.user?.roles) ? req.user.roles : []), req.user?.role]
    .filter(Boolean).map(r => r.toUpperCase());
  if (!req.user?.isSuperAdmin && !roles.includes('SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Apenas o Super Administrador pode aceder a esta configuração' });
  }
  next();
}

const maskKey = (key) => {
  if (!key) return null;
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

const mapConfig = (row) => ({
  isEnabled: row.is_enabled,
  evolutionBaseUrl: row.evolution_base_url,
  evolutionInstance: row.evolution_instance,
  evolutionApiKey: maskKey(row.evolution_api_key),
  hasEvolutionApiKey: !!row.evolution_api_key,
  webhookSecret: row.webhook_secret,
  llmProvider: row.llm_provider,
  llmApiKey: maskKey(row.llm_api_key),
  hasLlmApiKey: !!row.llm_api_key,
  llmModel: row.llm_model,
  authorizedNumbers: row.authorized_numbers || [],
  updatedAt: row.updated_at,
});

// GET /api/assistant/config
router.get('/config', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM assistant_config WHERE id = 1');
    if (!rows.length) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(mapConfig(rows[0]));
  } catch (err) {
    console.error('[GET /assistant/config]', err);
    res.status(500).json({ error: 'Erro ao buscar configuração' });
  }
});

// PUT /api/assistant/config
router.put('/config', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const c = req.body;
    // Um valor "mascarado" (ex: "sk-ant...ab12") devolvido sem alteração pelo frontend não deve substituir a chave real
    const isRealValue = (v) => typeof v === 'string' && !v.includes('...');

    const fields = [];
    const values = [];
    let i = 1;

    if (c.isEnabled !== undefined) { fields.push(`is_enabled = $${i++}`); values.push(!!c.isEnabled); }
    if (c.evolutionBaseUrl !== undefined) { fields.push(`evolution_base_url = $${i++}`); values.push(c.evolutionBaseUrl || null); }
    if (c.evolutionInstance !== undefined) { fields.push(`evolution_instance = $${i++}`); values.push(c.evolutionInstance || null); }
    if (c.evolutionApiKey !== undefined && isRealValue(c.evolutionApiKey)) { fields.push(`evolution_api_key = $${i++}`); values.push(c.evolutionApiKey || null); }
    if (c.llmProvider !== undefined) { fields.push(`llm_provider = $${i++}`); values.push(c.llmProvider || null); }
    if (c.llmApiKey !== undefined && isRealValue(c.llmApiKey)) { fields.push(`llm_api_key = $${i++}`); values.push(c.llmApiKey || null); }
    if (c.llmModel !== undefined) { fields.push(`llm_model = $${i++}`); values.push(c.llmModel || null); }
    if (c.authorizedNumbers !== undefined) {
      const nums = Array.isArray(c.authorizedNumbers) ? c.authorizedNumbers.map(n => String(n).replace(/\D/g, '')).filter(Boolean) : null;
      fields.push(`authorized_numbers = $${i++}`); values.push(nums);
    }
    fields.push('updated_at = NOW()');

    if (!fields.length) return res.json({ success: true });

    const { rows } = await pool.query(`UPDATE assistant_config SET ${fields.join(', ')} WHERE id = 1 RETURNING *`, values);
    res.json(mapConfig(rows[0]));
  } catch (err) {
    console.error('[PUT /assistant/config]', err);
    res.status(500).json({ error: 'Erro ao atualizar configuração' });
  }
});

// POST /api/assistant/test-connection — envia uma mensagem de teste ao primeiro número autorizado
router.post('/test-connection', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM assistant_config WHERE id = 1');
    const config = rows[0];
    if (!config?.authorized_numbers?.length) {
      return res.status(400).json({ error: 'Adicione pelo menos um número autorizado antes de testar' });
    }
    await sendEvolutionMessage(config, config.authorized_numbers[0],
      '✅ Teste de ligação do assistente — se recebeu esta mensagem, a Evolution API está configurada corretamente.');
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /assistant/test-connection]', err);
    res.status(500).json({ error: err.message || 'Erro ao enviar mensagem de teste' });
  }
});

// POST /api/assistant/webhook/:secret — recebe mensagens da Evolution API (sem authMiddleware; autenticado pelo segredo no caminho)
// Nota: o segredo vai no CAMINHO (não em query string) porque esta Evolution API acrescenta
// o nome do evento no fim do URL configurado (ex: "/webhook?secret=X" vira "/webhook?secret=X/chats-update",
// o que partia a query string) mesmo com "Webhook by Events" desligado na instância — um comportamento do
// próprio servidor Evolution, fora do nosso controlo. Usar o segredo como segmento do caminho, com um
// segmento de evento opcional a seguir, sobrevive a esse sufixo em qualquer dos casos.
// Formato exato do payload varia consoante a versão da Evolution API instalada; esta extração cobre o
// formato mais comum (Baileys) e pode precisar de ajuste.
router.post('/webhook/:secret/:event?', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM assistant_config WHERE id = 1');
    const config = rows[0];
    if (!config || !config.is_enabled) return res.status(200).json({ ok: true });

    const providedSecret = req.params.secret || req.headers['x-webhook-secret'];
    if (!providedSecret || providedSecret !== config.webhook_secret) {
      return res.status(401).json({ error: 'Segredo inválido' });
    }

    // Só nos interessam eventos de mensagem recebida — ignora chats-update, contacts-update, connection-update, etc.
    if (req.params.event && !/messages?[-_]?upsert/i.test(req.params.event)) {
      return res.status(200).json({ ok: true });
    }

    console.log('[assistant webhook] payload recebido:', JSON.stringify(req.body).slice(0, 2000));

    const data = req.body?.data || req.body || {};
    const remoteJid = data?.key?.remoteJid || data?.remoteJid;
    const fromMe = data?.key?.fromMe;
    const text = data?.message?.conversation || data?.message?.extendedTextMessage?.text || data?.body;

    // Responde já 200 — a Evolution API não deve esperar pelo LLM + envio da resposta
    res.status(200).json({ ok: true });

    if (!remoteJid || fromMe || !text || typeof text !== 'string') return;

    // JIDs multi-device vêm como "<numero>:<deviceId>@s.whatsapp.net" — o deviceId tem de ser descartado
    // antes de comparar com authorized_numbers, senão a comparação nunca bate certo.
    const phone = String(remoteJid).split('@')[0].split(':')[0].replace(/\D/g, '');
    const authorized = (config.authorized_numbers || []).map(n => n.replace(/\D/g, ''));
    if (!authorized.includes(phone)) {
      console.log(`[assistant webhook] número não autorizado: "${phone}" (autorizados: ${authorized.join(', ')})`);
      return; // número não autorizado — ignora silenciosamente
    }

    handleIncomingMessage(config, phone, text).catch(err => console.error('[assistant webhook]', err));
  } catch (err) {
    console.error('[POST /assistant/webhook]', err);
    if (!res.headersSent) res.status(200).json({ ok: true });
  }
});

export default router;
