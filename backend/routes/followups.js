import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listRules, updateRule, previewRule, runFollowups, recentFollowups } from '../services/followupService.js';

const router = express.Router();

// Só a equipa (qualquer papel que não seja apenas CLIENTE)
function requireStaff(req, res, next) {
  const roles = (Array.isArray(req.user?.roles) && req.user.roles.length ? req.user.roles : [req.user?.role])
    .map(r => String(r || '').toUpperCase());
  if (!req.user?.isSuperAdmin && !roles.some(r => r && r !== 'CLIENTE')) return res.status(403).json({ error: 'Sem permissão' });
  next();
}

router.use(authMiddleware, requireStaff);

// GET /api/followups — regras, configuração, textos e estatísticas (30 dias)
router.get('/', async (_req, res) => {
  try { res.json(await listRules()); }
  catch (err) { console.error('[GET /followups]', err); res.status(500).json({ error: 'Erro ao carregar automações' }); }
});

// GET /api/followups/log — últimas mensagens enviadas pelas automações
router.get('/log', async (req, res) => {
  try { res.json(await recentFollowups(req.query.limit)); }
  catch (err) { console.error('[GET /followups/log]', err); res.status(500).json({ error: 'Erro ao carregar o histórico' }); }
});

// PUT /api/followups/:key — ligar/desligar, tempos e textos
router.put('/:key', async (req, res) => {
  try { res.json(await updateRule(req.params.key, req.body || {})); }
  catch (err) { res.status(err.status || 500).json({ error: err.message || 'Erro ao guardar' }); }
});

// POST /api/followups/:key/preview — texto final com dados de exemplo
router.post('/:key/preview', async (req, res) => {
  try { res.json(await previewRule(req.params.key, Number(req.body?.templateIndex) || 0, req.body?.template)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message || 'Erro na pré-visualização' }); }
});

// POST /api/followups/run — executa uma ronda já (em segundo plano; ignora o horário)
router.post('/run', async (_req, res) => {
  runFollowups({ force: true }).catch(err => console.error('[followups run]', err));
  res.json({ started: true });
});

export default router;
