import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();

const GOAL_TYPES = ['unit_threshold', 'promoter_target', 'daily_category_commission', 'service_commission'];

const mapGoal = (g) => ({
  id: g.id,
  name: g.name,
  type: g.type,
  productId: g.product_id,
  productName: g.product_name,
  everyNUnits: g.every_n_units,
  targetValue: g.target_value != null ? Number(g.target_value) : null,
  baseAmount: g.base_amount != null ? Number(g.base_amount) : null,
  fullAmount: g.full_amount != null ? Number(g.full_amount) : null,
  category: g.category,
  minDailyUnits: g.min_daily_units,
  commissionPercent: g.commission_percent != null ? Number(g.commission_percent) : null,
  clinicServiceId: g.clinic_service_id,
  clinicServiceName: g.clinic_service_name,
  employeeIds: g.employee_ids || [],
  isActive: g.is_active,
  notes: g.notes,
  createdAt: g.created_at,
  updatedAt: g.updated_at,
});

// GET /api/incentives/goals
router.get('/goals', authMiddleware, requirePermission('hr.view'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*, p.name AS product_name, cs.name AS clinic_service_name
       FROM staff_incentive_goals g
       LEFT JOIN products p ON p.id = g.product_id
       LEFT JOIN clinic_services cs ON cs.id = g.clinic_service_id
       ORDER BY g.created_at DESC`
    );
    res.json(rows.map(mapGoal));
  } catch (err) {
    console.error('[GET /incentives/goals]', err);
    res.status(500).json({ error: 'Erro ao buscar metas' });
  }
});

// POST /api/incentives/goals
router.post('/goals', authMiddleware, requirePermission('hr.manage'), async (req, res) => {
  try {
    const g = req.body;
    if (!g.name || !GOAL_TYPES.includes(g.type)) {
      return res.status(400).json({ error: `name e type (${GOAL_TYPES.join('|')}) são obrigatórios` });
    }
    if (g.type === 'unit_threshold' && (!g.productId || !g.everyNUnits || Number(g.everyNUnits) < 1)) {
      return res.status(400).json({ error: 'productId e everyNUnits (>=1) são obrigatórios para unit_threshold' });
    }
    if (g.type === 'promoter_target' && (g.targetValue == null || g.baseAmount == null || g.fullAmount == null)) {
      return res.status(400).json({ error: 'targetValue, baseAmount e fullAmount são obrigatórios para promoter_target' });
    }
    if (g.type === 'daily_category_commission' && (!g.category || !g.minDailyUnits || !g.commissionPercent)) {
      return res.status(400).json({ error: 'category, minDailyUnits e commissionPercent são obrigatórios para daily_category_commission' });
    }
    if (g.type === 'service_commission' && (!g.clinicServiceId || !g.commissionPercent)) {
      return res.status(400).json({ error: 'clinicServiceId e commissionPercent são obrigatórios para service_commission' });
    }

    const { rows } = await pool.query(
      `INSERT INTO staff_incentive_goals
         (name, type, product_id, every_n_units, target_value, base_amount, full_amount,
          category, min_daily_units, commission_percent, clinic_service_id, employee_ids, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        g.name, g.type,
        g.productId || null,
        g.type === 'unit_threshold' ? Number(g.everyNUnits) : null,
        g.type === 'promoter_target' ? Number(g.targetValue) : null,
        g.type === 'promoter_target' ? Number(g.baseAmount) : null,
        g.type === 'promoter_target' ? Number(g.fullAmount) : null,
        g.type === 'daily_category_commission' ? g.category : null,
        g.type === 'daily_category_commission' ? Number(g.minDailyUnits) : null,
        (g.type === 'daily_category_commission' || g.type === 'service_commission') ? Number(g.commissionPercent) : null,
        g.type === 'service_commission' ? g.clinicServiceId : null,
        Array.isArray(g.employeeIds) && g.employeeIds.length ? g.employeeIds : null,
        g.notes || null,
        req.user.id,
      ]
    );
    res.status(201).json(mapGoal(rows[0]));
  } catch (err) {
    console.error('[POST /incentives/goals]', err);
    res.status(500).json({ error: 'Erro ao criar meta' });
  }
});

// PUT /api/incentives/goals/:id
router.put('/goals/:id', authMiddleware, requirePermission('hr.manage'), async (req, res) => {
  try {
    const g = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (g.name !== undefined) { fields.push(`name = $${i++}`); values.push(g.name); }
    if (g.productId !== undefined) { fields.push(`product_id = $${i++}`); values.push(g.productId || null); }
    if (g.everyNUnits !== undefined) { fields.push(`every_n_units = $${i++}`); values.push(g.everyNUnits != null ? Number(g.everyNUnits) : null); }
    if (g.targetValue !== undefined) { fields.push(`target_value = $${i++}`); values.push(g.targetValue != null ? Number(g.targetValue) : null); }
    if (g.baseAmount !== undefined) { fields.push(`base_amount = $${i++}`); values.push(g.baseAmount != null ? Number(g.baseAmount) : null); }
    if (g.fullAmount !== undefined) { fields.push(`full_amount = $${i++}`); values.push(g.fullAmount != null ? Number(g.fullAmount) : null); }
    if (g.category !== undefined) { fields.push(`category = $${i++}`); values.push(g.category || null); }
    if (g.minDailyUnits !== undefined) { fields.push(`min_daily_units = $${i++}`); values.push(g.minDailyUnits != null ? Number(g.minDailyUnits) : null); }
    if (g.commissionPercent !== undefined) { fields.push(`commission_percent = $${i++}`); values.push(g.commissionPercent != null ? Number(g.commissionPercent) : null); }
    if (g.clinicServiceId !== undefined) { fields.push(`clinic_service_id = $${i++}`); values.push(g.clinicServiceId || null); }
    if (g.employeeIds !== undefined) { fields.push(`employee_ids = $${i++}`); values.push(Array.isArray(g.employeeIds) && g.employeeIds.length ? g.employeeIds : null); }
    if (g.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(g.isActive); }
    if (g.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(g.notes || null); }
    fields.push(`updated_at = NOW()`);

    if (!fields.length) return res.json({ success: true });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE staff_incentive_goals SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Meta não encontrada' });
    res.json(mapGoal(rows[0]));
  } catch (err) {
    console.error('[PUT /incentives/goals/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar meta' });
  }
});

// DELETE /api/incentives/goals/:id
router.delete('/goals/:id', authMiddleware, requirePermission('hr.manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM staff_incentive_goals WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /incentives/goals/:id]', err);
    res.status(500).json({ error: 'Erro ao apagar meta' });
  }
});

// ─── Relatório de bónus ───────────────────────────────────────────────────────

const NON_COUNTING_STATUSES = ['pending', 'cancelled'];

async function computeBonusReport(from, to) {
  const { rows: employees } = await pool.query(
    `SELECT id, profile_id, full_name, job_title FROM employees WHERE status = 'active' AND profile_id IS NOT NULL`
  );

  const { rows: goals } = await pool.query(
    `SELECT g.*, p.name AS product_name, cs.name AS clinic_service_name
     FROM staff_incentive_goals g
     LEFT JOIN products p ON p.id = g.product_id
     LEFT JOIN clinic_services cs ON cs.id = g.clinic_service_id
     WHERE g.is_active = true`
  );

  const needsCategoryData = goals.some(g => g.type === 'daily_category_commission');
  const needsClinicData = goals.some(g => g.type === 'service_commission');

  const { rows: orders } = await pool.query(
    `SELECT created_by, items, to_char(created_at, 'YYYY-MM-DD') AS day FROM orders
     WHERE source = 'pos' AND status <> ALL($1::text[])
       AND created_by IS NOT NULL
       AND created_at >= $2 AND created_at < ($3::date + INTERVAL '1 day')`,
    [NON_COUNTING_STATUSES, from, to]
  );

  let categoryByProduct = new Map();
  if (needsCategoryData) {
    const { rows: prods } = await pool.query('SELECT id, category FROM products');
    categoryByProduct = new Map(prods.map(p => [p.id, p.category]));
  }

  // profileId -> { total: {units,revenue}, byProduct: Map(productId -> {units,revenue}),
  //                byDayCategory: Map(category -> Map(day -> {units,revenue})) }
  const perEmployee = new Map();
  for (const o of orders) {
    if (!perEmployee.has(o.created_by)) {
      perEmployee.set(o.created_by, { total: { units: 0, revenue: 0 }, byProduct: new Map(), byDayCategory: new Map() });
    }
    const agg = perEmployee.get(o.created_by);
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const qty = Number(it.quantity) || 0;
      const lineTotal = qty * (Number(it.price) || 0);
      agg.total.units += qty;
      agg.total.revenue += lineTotal;
      if (it.productId) {
        const cur = agg.byProduct.get(it.productId) || { units: 0, revenue: 0 };
        cur.units += qty;
        cur.revenue += lineTotal;
        agg.byProduct.set(it.productId, cur);

        if (needsCategoryData) {
          const cat = categoryByProduct.get(it.productId);
          if (cat) {
            if (!agg.byDayCategory.has(cat)) agg.byDayCategory.set(cat, new Map());
            const dayMap = agg.byDayCategory.get(cat);
            const dcur = dayMap.get(o.day) || { units: 0, revenue: 0 };
            dcur.units += qty;
            dcur.revenue += lineTotal;
            dayMap.set(o.day, dcur);
          }
        }
      }
    }
  }

  // profileId -> Map(clinicServiceId -> {count,revenue}), só faturas pagas
  let clinicByEmployee = new Map();
  if (needsClinicData) {
    const { rows: invoices } = await pool.query(
      `SELECT created_by, items FROM clinic_invoices
       WHERE status = 'pago' AND created_by IS NOT NULL
         AND created_at >= $1 AND created_at < ($2::date + INTERVAL '1 day')`,
      [from, to]
    );
    for (const inv of invoices) {
      if (!clinicByEmployee.has(inv.created_by)) clinicByEmployee.set(inv.created_by, new Map());
      const byService = clinicByEmployee.get(inv.created_by);
      for (const it of Array.isArray(inv.items) ? inv.items : []) {
        if (!it.serviceId) continue;
        const qty = Number(it.quantity) || 0;
        const cur = byService.get(it.serviceId) || { count: 0, revenue: 0 };
        cur.count += qty;
        cur.revenue += qty * (Number(it.unitPrice) || 0);
        byService.set(it.serviceId, cur);
      }
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const results = [];

  for (const emp of employees) {
    const applicable = goals.filter(g => !g.employee_ids || g.employee_ids.length === 0 || g.employee_ids.includes(emp.id));
    if (!applicable.length) continue;

    const empAgg = perEmployee.get(emp.profile_id);
    const goalResults = [];
    let totalBonus = 0;

    for (const g of applicable) {
      if (g.type === 'unit_threshold') {
        const prod = empAgg?.byProduct.get(g.product_id);
        const units = prod?.units || 0;
        if (units <= 0) continue;
        const everyN = Number(g.every_n_units) || 1;
        const bonusUnits = Math.floor(units / everyN);
        const avgPrice = units > 0 ? prod.revenue / units : 0;
        const bonusValue = round2(bonusUnits * avgPrice);
        goalResults.push({
          goalId: g.id, goalName: g.name, type: g.type, productName: g.product_name,
          unitsSold: units, everyNUnits: everyN, bonusUnits, bonusValue,
        });
        totalBonus += bonusValue;
      } else if (g.type === 'promoter_target') {
        const salesValue = g.product_id ? (empAgg?.byProduct.get(g.product_id)?.revenue || 0) : (empAgg?.total.revenue || 0);
        const target = Number(g.target_value) || 0;
        const achieved = salesValue >= target;
        const bonusValue = achieved ? round2(Number(g.full_amount) - Number(g.base_amount)) : 0;
        goalResults.push({
          goalId: g.id, goalName: g.name, type: g.type, productName: g.product_name,
          salesValue: round2(salesValue), targetValue: target, achieved,
          baseAmount: Number(g.base_amount), fullAmount: Number(g.full_amount), bonusValue,
        });
        totalBonus += bonusValue;
      } else if (g.type === 'daily_category_commission') {
        const pct = Number(g.commission_percent) || 0;
        const minUnits = Number(g.min_daily_units) || 1;
        const dayMap = empAgg?.byDayCategory.get(g.category);
        let qualifyingRevenue = 0;
        let qualifyingDays = 0;
        if (dayMap) {
          for (const dv of dayMap.values()) {
            if (dv.units >= minUnits) { qualifyingRevenue += dv.revenue; qualifyingDays += 1; }
          }
        }
        if (qualifyingDays === 0) continue;
        const bonusValue = round2(qualifyingRevenue * pct / 100);
        goalResults.push({
          goalId: g.id, goalName: g.name, type: g.type, category: g.category,
          qualifyingDays, minDailyUnits: minUnits, commissionPercent: pct,
          qualifyingRevenue: round2(qualifyingRevenue), bonusValue,
        });
        totalBonus += bonusValue;
      } else if (g.type === 'service_commission') {
        const pct = Number(g.commission_percent) || 0;
        const svc = clinicByEmployee.get(emp.profile_id)?.get(g.clinic_service_id);
        if (!svc || svc.count <= 0) continue;
        const bonusValue = round2(svc.revenue * pct / 100);
        goalResults.push({
          goalId: g.id, goalName: g.name, type: g.type, clinicServiceName: g.clinic_service_name,
          count: svc.count, revenue: round2(svc.revenue), commissionPercent: pct, bonusValue,
        });
        totalBonus += bonusValue;
      }
    }

    if (goalResults.length) {
      results.push({
        employeeId: emp.id, employeeName: emp.full_name, jobTitle: emp.job_title,
        goals: goalResults, totalBonus: round2(totalBonus),
      });
    }
  }

  const grandTotal = round2(results.reduce((s, r) => s + r.totalBonus, 0));
  return { from, to, employees: results, grandTotal };
}

// GET /api/incentives/report?from=&to=
router.get('/report', authMiddleware, requirePermission('hr.view'), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios (YYYY-MM-DD)' });
    res.json(await computeBonusReport(from, to));
  } catch (err) {
    console.error('[GET /incentives/report]', err);
    res.status(500).json({ error: 'Erro ao calcular relatório de bónus' });
  }
});

export { computeBonusReport };
export default router;
