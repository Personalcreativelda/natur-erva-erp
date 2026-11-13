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
      ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
})().catch(e => console.warn('[reviews] table init skipped:', e.message));

// GET /api/reviews?limit=24  — public
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 24, 100);
  try {
    await reviewsTableReady;
    const { rows } = await pool.query(`
      SELECT pr.id::text, pr.product_id, pr.user_name, pr.rating, pr.comment,
             pr.avatar_url, pr.photo_urls, pr.created_at,
             p.slug AS product_slug, p.name AS product_name
      FROM product_reviews pr
      LEFT JOIN products p ON p.id = pr.product_id
      WHERE pr.comment IS NOT NULL AND pr.comment <> ''
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
      SELECT id::text, product_id, user_name, rating, comment, avatar_url, photo_urls, created_at
      FROM product_reviews
      WHERE product_id = $1
      ORDER BY created_at DESC
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
      WHERE product_id = $1
    `, [req.params.productId]);
    res.json(rows[0] || { total: 0, average: 0 });
  } catch (e) {
    res.json({ total: 0, average: 0 });
  }
});

// POST /api/reviews  — auth required
router.post('/', authMiddleware, async (req, res) => {
  const { product_id, user_name, rating, comment, photo_data } = req.body;
  if (!product_id || !user_name || !rating) {
    return res.status(400).json({ error: 'product_id, user_name, rating required' });
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
      INSERT INTO product_reviews (product_id, user_id, user_name, rating, comment, avatar_url, photo_urls)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id::text, product_id, user_name, rating, comment, avatar_url, photo_urls, created_at
    `, [
      product_id,
      String(req.user.id),
      (profile?.name || user_name).trim(),
      Number(rating),
      (comment || '').trim(),
      profile?.avatar_url || null,
      JSON.stringify(photoUrls),
    ]);
    res.json(rows[0]);
  } catch (e) {
    console.error('[reviews] POST /', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
