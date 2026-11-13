import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { uploadToMinio } from '../storage/minio.js';

const router = express.Router();

// Create/upgrade table on first load. Existing reviews remain compatible.
const reviewsTableReady = (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE product_reviews
      ADD COLUMN IF NOT EXISTS user_id TEXT,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS order_id TEXT,
      ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE
  `);
})().catch(e => console.warn('[reviews] table init skipped:', e.message));

/** Staff (qualquer papel que não seja só CLIENTE) pode moderar avaliações. */
const isStaff = (user) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const roles = Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role];
  return roles.some(r => r && String(r).toUpperCase() !== 'CLIENTE');
};

const requireStaff = (req, res, next) => {
  if (!isStaff(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  next();
};

// O avatar é lido do perfil em tempo real: se o cliente mudar a foto,
// todas as avaliações dele passam a mostrar a nova foto.
const REVIEW_COLUMNS = `
  pr.id::text, pr.product_id, pr.user_id, pr.order_id,
  COALESCE(NULLIF(prof.name, ''), pr.user_name) AS user_name,
  pr.rating, pr.comment,
  COALESCE(prof.avatar_url, pr.avatar_url) AS avatar_url,
  pr.photo_urls, pr.is_hidden, pr.created_at,
  p.slug AS product_slug, p.name AS product_name
`;
const REVIEW_JOINS = `
  FROM product_reviews pr
  LEFT JOIN profiles prof ON prof.id::text = pr.user_id
  LEFT JOIN products p ON p.id::text = pr.product_id::text
`;

// GET /api/reviews?limit=60  — public (só visíveis e com comentário)
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 60, 200);
  try {
    await reviewsTableReady;
    const { rows } = await pool.query(`
      SELECT ${REVIEW_COLUMNS}
      ${REVIEW_JOINS}
      WHERE pr.is_hidden = FALSE AND pr.comment IS NOT NULL AND pr.comment <> ''
      ORDER BY pr.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (e) {
    console.error('[reviews] GET /', e.message);
    res.json([]);
  }
});

// GET /api/reviews/summary — public aggregate used by the testimonials section
router.get('/summary', async (_req, res) => {
  try {
    await reviewsTableReady;
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average
      FROM product_reviews
      WHERE is_hidden = FALSE
    `);
    res.json(rows[0] || { total: 0, average: 0 });
  } catch (e) {
    console.error('[reviews] GET /summary', e.message);
    res.json({ total: 0, average: 0 });
  }
});

// GET /api/reviews/product/:productId  — public
router.get('/product/:productId', async (req, res) => {
  try {
    await reviewsTableReady;
    const { rows } = await pool.query(`
      SELECT ${REVIEW_COLUMNS}
      ${REVIEW_JOINS}
      WHERE pr.product_id::text = $1 AND pr.is_hidden = FALSE
      ORDER BY pr.created_at DESC
    `, [req.params.productId]);
    res.json(rows);
  } catch (e) {
    console.error('[reviews] GET /product/:id', e.message);
    res.json([]);
  }
});

// GET /api/reviews/stats/:productId  — public
router.get('/stats/:productId', async (req, res) => {
  try {
    await reviewsTableReady;
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average
      FROM product_reviews
      WHERE product_id::text = $1 AND is_hidden = FALSE
    `, [req.params.productId]);
    res.json(rows[0] || { total: 0, average: 0 });
  } catch (e) {
    res.json({ total: 0, average: 0 });
  }
});

// GET /api/reviews/me — avaliações do cliente autenticado
router.get('/me', authMiddleware, async (req, res) => {
  try {
    await reviewsTableReady;
    const { rows } = await pool.query(`
      SELECT ${REVIEW_COLUMNS}
      ${REVIEW_JOINS}
      WHERE pr.user_id = $1
      ORDER BY pr.created_at DESC
    `, [String(req.user.id)]);
    res.json(rows);
  } catch (e) {
    console.error('[reviews] GET /me', e.message);
    res.status(500).json({ error: 'Erro ao carregar as suas avaliações' });
  }
});

// GET /api/reviews/pending — produtos comprados e entregues que o cliente ainda não avaliou
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    await reviewsTableReady;
    const userId = String(req.user.id);
    const { rows } = await pool.query(`
      WITH bought AS (
        SELECT DISTINCT ON (item->>'productId')
               item->>'productId'   AS product_id,
               item->>'productName' AS item_name,
               o.id::text           AS order_id,
               COALESCE(o.delivered_at, o.updated_at, o.created_at) AS received_at
        FROM orders o
        JOIN profiles me ON me.id::text = $1
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE (o.created_by::text = $1 OR (me.customer_id IS NOT NULL AND o.customer_id = me.customer_id))
          AND o.status IN ('delivered', 'completed')
          AND COALESCE(item->>'productId', '') <> ''
        ORDER BY item->>'productId', received_at DESC
      )
      SELECT b.product_id, b.order_id, b.received_at,
             COALESCE(p.name, b.item_name) AS product_name,
             p.slug AS product_slug, p.image AS product_image
      FROM bought b
      LEFT JOIN products p ON p.id::text = b.product_id
      WHERE NOT EXISTS (
        SELECT 1 FROM product_reviews pr
        WHERE pr.user_id = $1 AND pr.product_id::text = b.product_id
      )
      ORDER BY b.received_at DESC
      LIMIT 30
    `, [userId]);
    res.json(rows);
  } catch (e) {
    console.error('[reviews] GET /pending', e.message);
    res.status(500).json({ error: 'Erro ao carregar produtos por avaliar' });
  }
});

// ── Moderação (admin) ────────────────────────────────────────────────────────

// GET /api/reviews/admin?status=all|visible|hidden&q=texto
router.get('/admin', authMiddleware, requireStaff, async (req, res) => {
  try {
    await reviewsTableReady;
    const where = [];
    const params = [];
    if (req.query.status === 'visible') where.push('pr.is_hidden = FALSE');
    if (req.query.status === 'hidden') where.push('pr.is_hidden = TRUE');
    if (req.query.q) {
      params.push(`%${String(req.query.q).trim()}%`);
      where.push(`(pr.comment ILIKE $${params.length} OR pr.user_name ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
    }
    const { rows } = await pool.query(`
      SELECT ${REVIEW_COLUMNS}, prof.email AS user_email
      ${REVIEW_JOINS}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY pr.created_at DESC
      LIMIT 500
    `, params);
    res.json(rows);
  } catch (e) {
    console.error('[reviews] GET /admin', e.message);
    res.status(500).json({ error: 'Erro ao carregar avaliações' });
  }
});

// PATCH /api/reviews/:id — ocultar / mostrar
router.patch('/:id', authMiddleware, requireStaff, async (req, res) => {
  try {
    await reviewsTableReady;
    const hidden = req.body?.is_hidden === true;
    const { rowCount } = await pool.query(
      'UPDATE product_reviews SET is_hidden = $1 WHERE id::text = $2',
      [hidden, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Avaliação não encontrada' });
    res.json({ success: true, is_hidden: hidden });
  } catch (e) {
    console.error('[reviews] PATCH /:id', e.message);
    res.status(500).json({ error: 'Erro ao actualizar avaliação' });
  }
});

// DELETE /api/reviews/:id — staff apaga qualquer uma; cliente só a sua
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await reviewsTableReady;
    const params = [req.params.id];
    let sql = 'DELETE FROM product_reviews WHERE id::text = $1';
    if (!isStaff(req.user)) {
      params.push(String(req.user.id));
      sql += ' AND user_id = $2';
    }
    const { rowCount } = await pool.query(sql, params);
    if (!rowCount) return res.status(404).json({ error: 'Avaliação não encontrada' });
    res.json({ success: true });
  } catch (e) {
    console.error('[reviews] DELETE /:id', e.message);
    res.status(500).json({ error: 'Erro ao apagar avaliação' });
  }
});

// POST /api/reviews  — auth required
router.post('/', authMiddleware, async (req, res) => {
  const { product_id, user_name, rating, comment, photo_data, order_id } = req.body;
  const numericRating = Number(rating);
  if (!product_id || !user_name || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'product_id, user_name e rating (1-5) são obrigatórios' });
  }
  try {
    await reviewsTableReady;
    const photos = Array.isArray(photo_data) ? photo_data.slice(0, 3) : [];
    const photoUrls = [];

    for (const dataUrl of photos) {
      const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!match) continue;
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Cada fotografia deve ter no máximo 5 MB' });
      }
      const uploaded = await uploadToMinio(buffer, 'reviews', match[1]);
      photoUrls.push(uploaded.url);
    }

    let profile = null;
    try {
      const profileResult = await pool.query(
        'SELECT name, avatar_url FROM profiles WHERE id::text = $1 LIMIT 1',
        [String(req.user.id)]
      );
      profile = profileResult.rows[0] || null;
    } catch {}

    const { rows } = await pool.query(`
      INSERT INTO product_reviews (product_id, user_id, order_id, user_name, rating, comment, avatar_url, photo_urls)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING id::text, product_id, user_name, rating, comment, avatar_url, photo_urls, created_at
    `, [
      String(product_id),
      String(req.user.id),
      order_id ? String(order_id) : null,
      String(profile?.name || user_name).trim().slice(0, 80),
      numericRating,
      String(comment || '').trim().slice(0, 1000),
      profile?.avatar_url || null,
      JSON.stringify(photoUrls),
    ]);
    res.json(rows[0]);
  } catch (e) {
    console.error('[reviews] POST /', e.message);
    res.status(500).json({ error: 'Erro ao gravar a avaliação' });
  }
});

export default router;
