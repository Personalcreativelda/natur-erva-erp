import express from 'express';
import multer from 'multer';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { uploadToMinio } from '../storage/minio.js';

const router = express.Router();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (!ok) return cb(new Error('Apenas imagens ou PDF são permitidos'));
    cb(null, true);
  },
});

const AREAS = ['consulta_integrativa', 'bioressonancia', 'nutricao_integrativa', 'fitoterapia_suplementacao', 'educacao_saude'];

const mapPatient = (p) => ({
  id: p.id,
  customerId: p.customer_id,
  customerName: p.customer_name,
  customerPhone: p.customer_phone,
  customerEmail: p.customer_email,
  fileNumber: p.file_number,
  birthDate: p.birth_date,
  sex: p.sex,
  profession: p.profession,
  healthHistory: p.health_history,
  allergies: p.allergies,
  consentAt: p.consent_at,
  consentVersion: p.consent_version,
  isActive: p.is_active,
  notes: p.notes,
  createdAt: p.created_at,
  updatedAt: p.updated_at
});

const mapRecord = (r) => ({
  id: r.id,
  patientId: r.patient_id,
  area: r.area,
  recordType: r.record_type,
  summary: r.summary,
  data: r.data,
  attachments: r.attachments,
  authorId: r.author_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const mapAppointment = (a) => ({
  id: a.id,
  patientId: a.patient_id,
  patientName: a.customer_name,
  therapistId: a.therapist_id,
  area: a.area,
  scheduledAt: a.scheduled_at,
  durationMinutes: a.duration_minutes,
  status: a.status,
  locationId: a.location_id,
  notes: a.notes,
  createdAt: a.created_at,
  updatedAt: a.updated_at
});

const mapProtocol = (p) => ({
  id: p.id,
  patientId: p.patient_id,
  area: p.area,
  title: p.title,
  prescribedBy: p.prescribed_by,
  startDate: p.start_date,
  endDate: p.end_date,
  status: p.status,
  notes: p.notes,
  createdAt: p.created_at,
  updatedAt: p.updated_at
});

const mapProtocolItem = (i) => ({
  id: i.id,
  protocolId: i.protocol_id,
  productId: i.product_id,
  productName: i.product_name,
  dosageText: i.dosage_text,
  frequencyText: i.frequency_text,
  quantityPerDispense: i.quantity_per_dispense
});

// ─── Pacientes ──────────────────────────────────────────────────────────────

// GET /api/clinic/patients
router.get('/patients', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cp.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM clinic_patients cp
       JOIN customers c ON c.id = cp.customer_id
       ORDER BY c.name ASC`
    );
    res.json(rows.map(mapPatient));
  } catch (err) {
    console.error('[GET /clinic/patients]', err);
    res.status(500).json({ error: 'Erro ao buscar pacientes' });
  }
});

// GET /api/clinic/patients/:id
router.get('/patients/:id', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cp.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM clinic_patients cp
       JOIN customers c ON c.id = cp.customer_id
       WHERE cp.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Paciente não encontrado' });
    res.json(mapPatient(rows[0]));
  } catch (err) {
    console.error('[GET /clinic/patients/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar paciente' });
  }
});

// POST /api/clinic/patients — promove um customer existente a paciente
router.post('/patients', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const p = req.body;
    if (!p.customerId) return res.status(400).json({ error: 'customerId é obrigatório' });

    const { rows } = await pool.query(
      `INSERT INTO clinic_patients (customer_id, birth_date, sex, profession, health_history, allergies, consent_at, consent_version, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        p.customerId,
        p.birthDate || null,
        p.sex || null,
        p.profession || null,
        JSON.stringify(p.healthHistory || {}),
        p.allergies || null,
        p.consentAt || null,
        p.consentVersion || null,
        p.notes || null,
        req.user.id
      ]
    );
    const { rows: cRows } = await pool.query('SELECT name, phone, email FROM customers WHERE id = $1', [p.customerId]);
    res.status(201).json(mapPatient({ ...rows[0], customer_name: cRows[0]?.name, customer_phone: cRows[0]?.phone, customer_email: cRows[0]?.email }));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este cliente já está registado como paciente' });
    }
    console.error('[POST /clinic/patients]', err);
    res.status(500).json({ error: 'Erro ao criar paciente' });
  }
});

// PUT /api/clinic/patients/:id
router.put('/patients/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const p = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (p.birthDate !== undefined) { fields.push(`birth_date = $${i++}`); values.push(p.birthDate || null); }
    if (p.sex !== undefined) { fields.push(`sex = $${i++}`); values.push(p.sex || null); }
    if (p.profession !== undefined) { fields.push(`profession = $${i++}`); values.push(p.profession || null); }
    if (p.healthHistory !== undefined) { fields.push(`health_history = $${i++}`); values.push(JSON.stringify(p.healthHistory)); }
    if (p.allergies !== undefined) { fields.push(`allergies = $${i++}`); values.push(p.allergies); }
    if (p.consentAt !== undefined) { fields.push(`consent_at = $${i++}`); values.push(p.consentAt); }
    if (p.consentVersion !== undefined) { fields.push(`consent_version = $${i++}`); values.push(p.consentVersion); }
    if (p.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(p.isActive); }
    if (p.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(p.notes); }
    fields.push(`updated_at = NOW()`);

    if (!fields.length) return res.json({ success: true });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE clinic_patients SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Paciente não encontrado' });
    res.json(mapPatient(rows[0]));
  } catch (err) {
    console.error('[PUT /clinic/patients/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar paciente' });
  }
});

// DELETE /api/clinic/patients/:id — remove o paciente e todo o seu histórico clínico
// (ficha, consultas e protocolos são apagados em cascata; o cliente subjacente não é afetado)
router.delete('/patients/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM clinic_patients WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Paciente não encontrado' });
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /clinic/patients/:id]', err);
    res.status(500).json({ error: 'Erro ao apagar paciente' });
  }
});

// ─── Ficha clínica ──────────────────────────────────────────────────────────

// GET /api/clinic/records?patientId=&area=
router.get('/records', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { patientId, area } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (patientId) { conditions.push(`patient_id = $${i++}`); values.push(patientId); }
    if (area) { conditions.push(`area = $${i++}`); values.push(area); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM clinical_records ${where} ORDER BY created_at DESC`,
      values
    );
    res.json(rows.map(mapRecord));
  } catch (err) {
    console.error('[GET /clinic/records]', err);
    res.status(500).json({ error: 'Erro ao buscar ficha clínica' });
  }
});

// POST /api/clinic/records
router.post('/records', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const r = req.body;
    if (!r.patientId || !AREAS.includes(r.area)) {
      return res.status(400).json({ error: 'patientId e area válida são obrigatórios' });
    }
    const { rows } = await pool.query(
      `INSERT INTO clinical_records (patient_id, area, record_type, summary, data, attachments, author_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        r.patientId, r.area, r.recordType || 'nota', r.summary || null,
        JSON.stringify(r.data || {}), JSON.stringify(r.attachments || []), req.user.id
      ]
    );
    res.status(201).json(mapRecord(rows[0]));
  } catch (err) {
    console.error('[POST /clinic/records]', err);
    res.status(500).json({ error: 'Erro ao criar registo clínico' });
  }
});

// PUT /api/clinic/records/:id
router.put('/records/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const r = req.body;
    const { rows } = await pool.query(
      `UPDATE clinical_records SET
         summary = COALESCE($1, summary),
         data = COALESCE($2, data),
         attachments = COALESCE($3, attachments),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [
        r.summary ?? null,
        r.data ? JSON.stringify(r.data) : null,
        r.attachments ? JSON.stringify(r.attachments) : null,
        req.params.id
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registo não encontrado' });
    res.json(mapRecord(rows[0]));
  } catch (err) {
    console.error('[PUT /clinic/records/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar registo clínico' });
  }
});

// POST /api/clinic/records/:id/attachments — anexa documento (imagem ou PDF)
router.post('/records/:id/attachments', authMiddleware, requirePermission('clinic.manage'), (req, res) => {
  attachmentUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Erro no upload' });
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });

    try {
      const { rows: recRows } = await pool.query('SELECT patient_id, attachments FROM clinical_records WHERE id = $1', [req.params.id]);
      if (!recRows.length) return res.status(404).json({ error: 'Registo não encontrado' });

      const { url } = await uploadToMinio(req.file.buffer, `clinic-documents/${recRows[0].patient_id}`, req.file.mimetype);
      const attachment = {
        name: req.file.originalname,
        url,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date().toISOString()
      };
      const attachments = [...(recRows[0].attachments || []), attachment];

      const { rows } = await pool.query(
        `UPDATE clinical_records SET attachments = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [JSON.stringify(attachments), req.params.id]
      );
      res.status(201).json(mapRecord(rows[0]));
    } catch (e) {
      console.error('[POST /clinic/records/:id/attachments]', e);
      res.status(500).json({ error: 'Erro ao anexar documento' });
    }
  });
});

// DELETE /api/clinic/records/:id/attachments/:index — remove um anexo pelo índice
router.delete('/records/:id/attachments/:index', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const { rows: recRows } = await pool.query('SELECT attachments FROM clinical_records WHERE id = $1', [req.params.id]);
    if (!recRows.length) return res.status(404).json({ error: 'Registo não encontrado' });

    const idx = Number(req.params.index);
    const attachments = (recRows[0].attachments || []).filter((_, i) => i !== idx);

    const { rows } = await pool.query(
      `UPDATE clinical_records SET attachments = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(attachments), req.params.id]
    );
    res.json(mapRecord(rows[0]));
  } catch (e) {
    console.error('[DELETE /clinic/records/:id/attachments/:index]', e);
    res.status(500).json({ error: 'Erro ao remover anexo' });
  }
});

// ─── Agenda ─────────────────────────────────────────────────────────────────

// GET /api/clinic/appointments?from=&to=&therapistId=&patientId=
router.get('/appointments', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { from, to, therapistId, patientId } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (from) { conditions.push(`a.scheduled_at >= $${i++}`); values.push(from); }
    if (to) { conditions.push(`a.scheduled_at <= $${i++}`); values.push(to); }
    if (therapistId) { conditions.push(`a.therapist_id = $${i++}`); values.push(therapistId); }
    if (patientId) { conditions.push(`a.patient_id = $${i++}`); values.push(patientId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT a.*, c.name AS customer_name
       FROM clinic_appointments a
       JOIN clinic_patients cp ON cp.id = a.patient_id
       JOIN customers c ON c.id = cp.customer_id
       ${where}
       ORDER BY a.scheduled_at ASC`,
      values
    );
    res.json(rows.map(mapAppointment));
  } catch (err) {
    console.error('[GET /clinic/appointments]', err);
    res.status(500).json({ error: 'Erro ao buscar agenda' });
  }
});

// POST /api/clinic/appointments
router.post('/appointments', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const a = req.body;
    if (!a.patientId || !a.scheduledAt || !AREAS.includes(a.area)) {
      return res.status(400).json({ error: 'patientId, scheduledAt e area válida são obrigatórios' });
    }
    const { rows } = await pool.query(
      `INSERT INTO clinic_appointments (patient_id, therapist_id, area, scheduled_at, duration_minutes, status, location_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'agendado'), $7, $8, $9) RETURNING *`,
      [
        a.patientId, a.therapistId || null, a.area, a.scheduledAt,
        a.durationMinutes || 60, a.status || null, a.locationId || null, a.notes || null, req.user.id
      ]
    );
    res.status(201).json(mapAppointment(rows[0]));
  } catch (err) {
    console.error('[POST /clinic/appointments]', err);
    res.status(500).json({ error: 'Erro ao criar consulta' });
  }
});

// PUT /api/clinic/appointments/:id
router.put('/appointments/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const a = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (a.therapistId !== undefined) { fields.push(`therapist_id = $${i++}`); values.push(a.therapistId); }
    if (a.scheduledAt !== undefined) { fields.push(`scheduled_at = $${i++}`); values.push(a.scheduledAt); }
    if (a.durationMinutes !== undefined) { fields.push(`duration_minutes = $${i++}`); values.push(a.durationMinutes); }
    if (a.status !== undefined) { fields.push(`status = $${i++}`); values.push(a.status); }
    if (a.locationId !== undefined) { fields.push(`location_id = $${i++}`); values.push(a.locationId); }
    if (a.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(a.notes); }
    fields.push(`updated_at = NOW()`);

    if (!fields.length) return res.json({ success: true });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE clinic_appointments SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Consulta não encontrada' });
    res.json(mapAppointment(rows[0]));
  } catch (err) {
    console.error('[PUT /clinic/appointments/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar consulta' });
  }
});

// DELETE /api/clinic/appointments/:id
router.delete('/appointments/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clinic_appointments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /clinic/appointments/:id]', err);
    res.status(500).json({ error: 'Erro ao apagar consulta' });
  }
});

// ─── Protocolos (fitoterapia / suplementação) ────────────────────────────────

// GET /api/clinic/protocols?patientId=&status=
router.get('/protocols', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { patientId, status } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;
    if (patientId) { conditions.push(`patient_id = $${i++}`); values.push(patientId); }
    if (status) { conditions.push(`status = $${i++}`); values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM clinic_protocols ${where} ORDER BY created_at DESC`,
      values
    );
    res.json(rows.map(mapProtocol));
  } catch (err) {
    console.error('[GET /clinic/protocols]', err);
    res.status(500).json({ error: 'Erro ao buscar protocolos' });
  }
});

// GET /api/clinic/protocols/:id — com itens
router.get('/protocols/:id', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clinic_protocols WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Protocolo não encontrado' });

    const { rows: itemRows } = await pool.query(
      `SELECT pi.*, p.name AS product_name
       FROM clinic_protocol_items pi
       LEFT JOIN products p ON p.id = pi.product_id
       WHERE pi.protocol_id = $1`,
      [req.params.id]
    );
    res.json({ ...mapProtocol(rows[0]), items: itemRows.map(mapProtocolItem) });
  } catch (err) {
    console.error('[GET /clinic/protocols/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar protocolo' });
  }
});

// POST /api/clinic/protocols — cria protocolo + itens e debita stock (auditável)
router.post('/protocols', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  const client = await pool.connect();
  try {
    const p = req.body;
    if (!p.patientId || !AREAS.includes(p.area) || !p.title) {
      return res.status(400).json({ error: 'patientId, area válida e title são obrigatórios' });
    }
    const items = Array.isArray(p.items) ? p.items : [];

    await client.query('BEGIN');

    const { rows: protoRows } = await client.query(
      `INSERT INTO clinic_protocols (patient_id, area, title, prescribed_by, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7) RETURNING *`,
      [p.patientId, p.area, p.title, req.user.id, p.startDate || null, p.endDate || null, p.notes || null]
    );
    const protocol = protoRows[0];

    const insertedItems = [];
    for (const item of items) {
      if (!item.productId) continue;
      const qty = Number(item.quantityPerDispense) || 1;

      const { rows: itemRows } = await client.query(
        `INSERT INTO clinic_protocol_items (protocol_id, product_id, dosage_text, frequency_text, quantity_per_dispense)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [protocol.id, item.productId, item.dosageText || null, item.frequencyText || null, qty]
      );
      insertedItems.push(itemRows[0]);

      // Debitar stock do produto e registar movimento auditável
      await client.query(
        'UPDATE products SET stock = GREATEST(0, stock - $1), updated_at = NOW() WHERE id = $2',
        [qty, item.productId]
      );
    }

    if (insertedItems.length) {
      await client.query(
        `INSERT INTO stock_movements (date, items, notes, source_reference, created_at)
         VALUES (NOW(), $1, $2, $3, NOW())`,
        [
          JSON.stringify(insertedItems.map((i) => ({ productId: i.product_id, quantity: -i.quantity_per_dispense }))),
          `Protocolo clínico: ${protocol.title}`,
          JSON.stringify({ type: 'clinic_protocol', id: protocol.id })
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...mapProtocol(protocol), items: insertedItems.map(mapProtocolItem) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /clinic/protocols]', err);
    res.status(500).json({ error: 'Erro ao criar protocolo' });
  } finally {
    client.release();
  }
});

// PUT /api/clinic/protocols/:id — apenas dados do protocolo (não mexe em itens/stock)
router.put('/protocols/:id', authMiddleware, requirePermission('clinic.manage'), async (req, res) => {
  try {
    const p = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (p.title !== undefined) { fields.push(`title = $${i++}`); values.push(p.title); }
    if (p.endDate !== undefined) { fields.push(`end_date = $${i++}`); values.push(p.endDate); }
    if (p.status !== undefined) { fields.push(`status = $${i++}`); values.push(p.status); }
    if (p.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(p.notes); }
    fields.push(`updated_at = NOW()`);

    if (!fields.length) return res.json({ success: true });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE clinic_protocols SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Protocolo não encontrado' });
    res.json(mapProtocol(rows[0]));
  } catch (err) {
    console.error('[PUT /clinic/protocols/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar protocolo' });
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

// GET /api/clinic/stats
router.get('/stats', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const [{ rows: patients }, { rows: appointmentsWeek }, { rows: activeProtocols }, { rows: byArea }] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS count FROM clinic_patients WHERE is_active = true`),
      pool.query(`SELECT COUNT(*) AS count FROM clinic_appointments WHERE scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND status IN ('agendado','confirmado')`),
      pool.query(`SELECT COUNT(*) AS count FROM clinic_protocols WHERE status = 'ativo'`),
      pool.query(`SELECT area, COUNT(*) AS count FROM clinical_records GROUP BY area`)
    ]);

    res.json({
      activePatients: parseInt(patients[0].count),
      appointmentsThisWeek: parseInt(appointmentsWeek[0].count),
      activeProtocols: parseInt(activeProtocols[0].count),
      recordsByArea: byArea.map((r) => ({ area: r.area, count: parseInt(r.count) }))
    });
  } catch (err) {
    console.error('[GET /clinic/stats]', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;
