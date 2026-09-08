import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();

const mapService = (s) => ({
  id: s.id,
  name: s.name,
  type: s.type,
  durationMinutes: s.duration_minutes,
  price: Number(s.price),
  includes: s.includes,
  isActive: s.is_active,
  displayOrder: s.display_order,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

const mapInvoice = (i) => ({
  id: i.id,
  invoiceNumber: i.invoice_number,
  patientId: i.patient_id,
  customerName: i.customer_name,
  customerPhone: i.customer_phone,
  items: i.items,
  subtotal: Number(i.subtotal),
  discount: Number(i.discount),
  total: Number(i.total),
  status: i.status,
  paymentMethod: i.payment_method,
  notes: i.notes,
  createdBy: i.created_by,
  createdAt: i.created_at,
  updatedAt: i.updated_at,
});

// ── Catálogo de preços ──────────────────────────────────────────────────────

router.get('/services', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const { rows } = await pool.query(
      `SELECT * FROM clinic_services ${includeInactive ? '' : 'WHERE is_active = true'} ORDER BY display_order ASC, name ASC`
    );
    res.json(rows.map(mapService));
  } catch (err) {
    console.error('[GET /clinic/services]', err);
    res.status(500).json({ error: 'Erro ao buscar catálogo de preços' });
  }
});

router.post('/services', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const s = req.body;
    if (!s.name || !s.type || s.price === undefined) {
      return res.status(400).json({ error: 'name, type e price são obrigatórios' });
    }
    if (!['servico', 'pacote'].includes(s.type)) {
      return res.status(400).json({ error: 'type inválido' });
    }
    const { rows } = await pool.query(
      `INSERT INTO clinic_services (name, type, duration_minutes, price, includes, display_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [s.name, s.type, s.durationMinutes || null, s.price, s.includes || null, s.displayOrder || 0]
    );
    res.status(201).json(mapService(rows[0]));
  } catch (err) {
    console.error('[POST /clinic/services]', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um serviço/pacote com esse nome' });
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

router.put('/services/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const s = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (s.name !== undefined) { fields.push(`name = $${i++}`); values.push(s.name); }
    if (s.type !== undefined) { fields.push(`type = $${i++}`); values.push(s.type); }
    if (s.durationMinutes !== undefined) { fields.push(`duration_minutes = $${i++}`); values.push(s.durationMinutes || null); }
    if (s.price !== undefined) { fields.push(`price = $${i++}`); values.push(s.price); }
    if (s.includes !== undefined) { fields.push(`includes = $${i++}`); values.push(s.includes || null); }
    if (s.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(!!s.isActive); }
    if (s.displayOrder !== undefined) { fields.push(`display_order = $${i++}`); values.push(s.displayOrder); }
    fields.push('updated_at = NOW()');
    if (!fields.length) return res.json({ success: true });
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE clinic_services SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    if (!rows.length) return res.status(404).json({ error: 'Serviço não encontrado' });
    res.json(mapService(rows[0]));
  } catch (err) {
    console.error('[PUT /clinic/services/:id]', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um serviço/pacote com esse nome' });
    res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
});

router.delete('/services/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clinic_services WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /clinic/services/:id]', err);
    res.status(500).json({ error: 'Erro ao remover serviço' });
  }
});

// ── Faturação ────────────────────────────────────────────────────────────────

router.get('/invoices', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { patientId, status } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (patientId) { conditions.push(`patient_id = $${i++}`); values.push(patientId); }
    if (status) { conditions.push(`status = $${i++}`); values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM clinic_invoices ${where} ORDER BY created_at DESC LIMIT 200`, values
    );
    res.json(rows.map(mapInvoice));
  } catch (err) {
    console.error('[GET /clinic/invoices]', err);
    res.status(500).json({ error: 'Erro ao buscar faturas' });
  }
});

router.get('/invoices/:id', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clinic_invoices WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Fatura não encontrada' });
    res.json(mapInvoice(rows[0]));
  } catch (err) {
    console.error('[GET /clinic/invoices/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar fatura' });
  }
});

router.post('/invoices', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.customerName) return res.status(400).json({ error: 'customerName é obrigatório' });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'É preciso pelo menos uma linha de serviço' });

    const serviceIds = b.items.map(it => it.serviceId).filter(Boolean);
    const { rows: services } = await pool.query(
      'SELECT id, name, price FROM clinic_services WHERE id = ANY($1::uuid[])', [serviceIds]
    );
    const serviceMap = new Map(services.map(s => [s.id, s]));

    const items = b.items.map(it => {
      const svc = serviceMap.get(it.serviceId);
      if (!svc) throw new Error(`Serviço não encontrado: ${it.serviceId}`);
      const quantity = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
      return { serviceId: svc.id, name: svc.name, quantity, unitPrice: Number(svc.price) };
    });
    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const discount = Number(b.discount) || 0;
    const total = Math.max(0, subtotal - discount);

    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS n FROM clinic_invoices');
    const invoiceNumber = `CLI-${new Date().getFullYear()}-${String(cnt[0].n + 1).padStart(4, '0')}`;

    const { rows } = await pool.query(
      `INSERT INTO clinic_invoices (invoice_number, patient_id, customer_name, customer_phone, items, subtotal, discount, total, status, payment_method, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [invoiceNumber, b.patientId || null, b.customerName, b.customerPhone || null,
        JSON.stringify(items), subtotal, discount, total, b.status || 'pendente',
        b.paymentMethod || null, b.notes || null, req.user?.id || null]
    );
    res.status(201).json(mapInvoice(rows[0]));
  } catch (err) {
    console.error('[POST /clinic/invoices]', err);
    res.status(400).json({ error: err.message || 'Erro ao criar fatura' });
  }
});

router.put('/invoices/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const b = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (b.status !== undefined) {
      if (!['pendente', 'pago', 'cancelado'].includes(b.status)) return res.status(400).json({ error: 'status inválido' });
      fields.push(`status = $${i++}`); values.push(b.status);
    }
    if (b.paymentMethod !== undefined) { fields.push(`payment_method = $${i++}`); values.push(b.paymentMethod || null); }
    if (b.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(b.notes || null); }
    fields.push('updated_at = NOW()');
    if (!fields.length) return res.json({ success: true });
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE clinic_invoices SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    if (!rows.length) return res.status(404).json({ error: 'Fatura não encontrada' });
    res.json(mapInvoice(rows[0]));
  } catch (err) {
    console.error('[PUT /clinic/invoices/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar fatura' });
  }
});

export default router;
