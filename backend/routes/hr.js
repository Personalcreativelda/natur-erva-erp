import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Migrate on startup ─────────────────────────────────────────────────────────
async function migrate() {
  const run = async (sql, label) => {
    try { await pool.query(sql); }
    catch (e) { console.error(`[hr] migrate ${label}:`, e.message); }
  };
  await run(`CREATE TABLE IF NOT EXISTS departments (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    description TEXT,
    manager_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`, 'departments');
  await run(`CREATE TABLE IF NOT EXISTS employees (
    id                SERIAL PRIMARY KEY,
    profile_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    department_id     INT REFERENCES departments(id) ON DELETE SET NULL,
    full_name         VARCHAR(150) NOT NULL,
    job_title         VARCHAR(100),
    hire_date         DATE,
    contract_type     VARCHAR(30) DEFAULT 'full_time',
    salary            DECIMAL(12,2) DEFAULT 0,
    phone             VARCHAR(30),
    email             VARCHAR(150),
    nuit              VARCHAR(20),
    emergency_contact VARCHAR(150),
    status            VARCHAR(20) DEFAULT 'active',
    avatar_url        TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )`, 'employees');
  await run(`CREATE TABLE IF NOT EXISTS contracts (
    id          SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type        VARCHAR(30) DEFAULT 'full_time',
    start_date  DATE NOT NULL,
    end_date    DATE,
    salary      DECIMAL(12,2) DEFAULT 0,
    status      VARCHAR(20) DEFAULT 'active',
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`, 'contracts');
  await run(`CREATE TABLE IF NOT EXISTS leave_requests (
    id          SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type        VARCHAR(30) DEFAULT 'annual',
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    days        INT NOT NULL DEFAULT 1,
    reason      TEXT,
    status      VARCHAR(20) DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`, 'leave_requests');
  await run(`CREATE TABLE IF NOT EXISTS payroll_periods (
    id          SERIAL PRIMARY KEY,
    period_name VARCHAR(50) NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    status      VARCHAR(20) DEFAULT 'draft',
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`, 'payroll_periods');
  await run(`CREATE TABLE IF NOT EXISTS payslips (
    id                SERIAL PRIMARY KEY,
    period_id         INT NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    employee_id       INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    gross_salary      DECIMAL(12,2) DEFAULT 0,
    inss_employee     DECIMAL(12,2) DEFAULT 0,
    inss_employer     DECIMAL(12,2) DEFAULT 0,
    irps              DECIMAL(12,2) DEFAULT 0,
    other_deductions  DECIMAL(12,2) DEFAULT 0,
    other_additions   DECIMAL(12,2) DEFAULT 0,
    net_salary        DECIMAL(12,2) DEFAULT 0,
    status            VARCHAR(20) DEFAULT 'pending',
    notes             TEXT,
    paid_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (period_id, employee_id)
  )`, 'payslips');
  // Coluna adicionada depois da criação inicial da tabela em produção — auto-corrige em cada arranque
  await run(`ALTER TABLE payslips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`, 'payslips.updated_at');
}
migrate();

// ── DEPARTMENTS ───────────────────────────────────────────────────────────────
router.get('/departments', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, p.name AS manager_name,
             COUNT(e.id)::int AS employee_count
      FROM departments d
      LEFT JOIN profiles p ON p.id = d.manager_id
      LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
      GROUP BY d.id, p.name
      ORDER BY d.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/departments', authMiddleware, async (req, res) => {
  const { name, description, manager_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO departments (name, description, manager_id) VALUES ($1,$2,$3) RETURNING *`,
      [name, description || null, manager_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/departments/:id', authMiddleware, async (req, res) => {
  const { name, description, manager_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE departments SET name=$1, description=$2, manager_id=$3 WHERE id=$4 RETURNING *`,
      [name, description || null, manager_id || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/departments/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM departments WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMPLOYEES ─────────────────────────────────────────────────────────────────
router.get('/employees', authMiddleware, async (req, res) => {
  const { status, department_id, q } = req.query;
  const filters = []; const params = [];
  if (status)        { params.push(status);        filters.push(`e.status = $${params.length}`); }
  if (department_id) { params.push(department_id); filters.push(`e.department_id = $${params.length}`); }
  if (q)             { params.push(`%${q}%`);      filters.push(`(e.full_name ILIKE $${params.length} OR e.email ILIKE $${params.length})`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(`
      SELECT e.*, d.name AS department_name
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      ${where}
      ORDER BY e.full_name
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/employees/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*, d.name AS department_name
      FROM employees e LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const contracts = await pool.query(`SELECT * FROM contracts WHERE employee_id=$1 ORDER BY start_date DESC`, [req.params.id]);
    const leaves    = await pool.query(`SELECT * FROM leave_requests WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.params.id]);
    res.json({ ...rows[0], contracts: contracts.rows, leaves: leaves.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const rateOrNull = (v) => (v === '' || v == null) ? null : Number(v);
const strOrNull  = (v) => (v === '' || v == null) ? null : String(v).trim();

router.post('/employees', authMiddleware, async (req, res) => {
  const { full_name, job_title, department_id, hire_date, contract_type, salary,
          phone, email, nuit, emergency_contact, notes, avatar_url, profile_id,
          inss_exempt, irps_exempt, inss_rate, irps_rate, dependents_count, inss_number, sexo, birth_date,
          payment_method, bank_name, bank_nib, bank_account, mpesa_number, emola_number } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO employees
        (full_name, job_title, department_id, hire_date, contract_type, salary,
         phone, email, nuit, emergency_contact, notes, avatar_url, profile_id,
         inss_exempt, irps_exempt, inss_rate, irps_rate, dependents_count, inss_number, sexo, birth_date,
         payment_method, bank_name, bank_nib, bank_account, mpesa_number, emola_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *
    `, [full_name, job_title, department_id||null, hire_date||null, contract_type||'full_time',
        salary||0, phone||null, email||null, nuit||null, emergency_contact||null,
        notes||null, avatar_url||null, profile_id||null,
        !!inss_exempt, !!irps_exempt, rateOrNull(inss_rate), rateOrNull(irps_rate),
        Number(dependents_count) || 0, strOrNull(inss_number), strOrNull(sexo), birth_date||null,
        payment_method || 'bank', strOrNull(bank_name), strOrNull(bank_nib),
        strOrNull(bank_account), strOrNull(mpesa_number), strOrNull(emola_number)]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/employees/:id', authMiddleware, async (req, res) => {
  const { full_name, job_title, department_id, hire_date, contract_type, salary,
          phone, email, nuit, emergency_contact, notes, avatar_url, status,
          inss_exempt, irps_exempt, inss_rate, irps_rate, dependents_count, inss_number, sexo, birth_date,
          payment_method, bank_name, bank_nib, bank_account, mpesa_number, emola_number } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE employees SET
        full_name=$1, job_title=$2, department_id=$3, hire_date=$4, contract_type=$5,
        salary=$6, phone=$7, email=$8, nuit=$9, emergency_contact=$10, notes=$11,
        avatar_url=$12, status=$13, inss_exempt=$14, irps_exempt=$15, inss_rate=$16, irps_rate=$17,
        dependents_count=$18, inss_number=$19, sexo=$20, birth_date=$21,
        payment_method=$22, bank_name=$23, bank_nib=$24, bank_account=$25,
        mpesa_number=$26, emola_number=$27, updated_at=NOW()
      WHERE id=$28 RETURNING *
    `, [full_name, job_title, department_id||null, hire_date||null, contract_type||'full_time',
        salary||0, phone||null, email||null, nuit||null, emergency_contact||null,
        notes||null, avatar_url||null, status||'active',
        !!inss_exempt, !!irps_exempt, rateOrNull(inss_rate), rateOrNull(irps_rate),
        Number(dependents_count) || 0, strOrNull(inss_number), strOrNull(sexo), birth_date||null,
        payment_method || 'bank', strOrNull(bank_name), strOrNull(bank_nib),
        strOrNull(bank_account), strOrNull(mpesa_number), strOrNull(emola_number),
        req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/employees/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM employees WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONTRACTS ─────────────────────────────────────────────────────────────────
router.post('/contracts', authMiddleware, async (req, res) => {
  const { employee_id, type, start_date, end_date, salary, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO contracts (employee_id,type,start_date,end_date,salary,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, type||'full_time', start_date, end_date||null, salary||0, notes||null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/contracts/:id', authMiddleware, async (req, res) => {
  const { type, start_date, end_date, salary, notes, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE contracts SET type=$1,start_date=$2,end_date=$3,salary=$4,notes=$5,status=$6 WHERE id=$7 RETURNING *`,
      [type, start_date, end_date||null, salary||0, notes||null, status||'active', req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LEAVE REQUESTS ────────────────────────────────────────────────────────────
router.get('/leaves', authMiddleware, async (req, res) => {
  const { status, employee_id } = req.query;
  const filters = []; const params = [];
  if (status)      { params.push(status);      filters.push(`l.status = $${params.length}`); }
  if (employee_id) { params.push(employee_id); filters.push(`l.employee_id = $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(`
      SELECT l.*, e.full_name AS employee_name
      FROM leave_requests l
      LEFT JOIN employees e ON e.id = l.employee_id
      ${where} ORDER BY l.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/leaves', authMiddleware, async (req, res) => {
  const { employee_id, type, start_date, end_date, days, reason } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO leave_requests (employee_id,type,start_date,end_date,days,reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, type||'annual', start_date, end_date, days||1, reason||null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/leaves/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const approved_by = status === 'approved' ? (req.user?.id || null) : null;
  const approved_at = status === 'approved' ? new Date() : null;
  try {
    const { rows } = await pool.query(
      `UPDATE leave_requests SET status=$1, approved_at=$2, approved_by=$3 WHERE id=$4 RETURNING *`,
      [status, approved_at, approved_by, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [total, active, onLeave, depts, pendingLeaves] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM employees`),
      pool.query(`SELECT COUNT(*)::int AS n FROM employees WHERE status='active'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM employees WHERE status='on_leave'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM departments`),
      pool.query(`SELECT COUNT(*)::int AS n FROM leave_requests WHERE status='pending'`),
    ]);
    res.json({
      total: total.rows[0].n, active: active.rows[0].n,
      on_leave: onLeave.rows[0].n, departments: depts.rows[0].n,
      pending_leaves: pendingLeaves.rows[0].n,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PAYROLL PERIODS ───────────────────────────────────────────────────────────
router.get('/payroll', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pp.*,
             COUNT(ps.id)::int AS slip_count,
             COALESCE(SUM(ps.gross_salary), 0) AS total_gross,
             COALESCE(SUM(ps.net_salary), 0)   AS total_net
      FROM payroll_periods pp
      LEFT JOIN payslips ps ON ps.period_id = pp.id
      GROUP BY pp.id
      ORDER BY pp.start_date DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Configuração do Payroll (padrão Moçambique) ────────────────────────────────
async function getPayrollConfig() {
  const { rows } = await pool.query('SELECT * FROM payroll_config WHERE id = 1');
  return rows[0];
}

router.get('/payroll-config', authMiddleware, async (req, res) => {
  try { res.json(await getPayrollConfig()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/payroll-config', authMiddleware, async (req, res) => {
  const { year, normal_hours_month, hours_per_day, inss_employee_rate, inss_employer_rate,
          overtime_50_rate, overtime_100_rate, night_work_rate, union_fee_rate } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE payroll_config SET
        year=$1, normal_hours_month=$2, hours_per_day=$3, inss_employee_rate=$4, inss_employer_rate=$5,
        overtime_50_rate=$6, overtime_100_rate=$7, night_work_rate=$8, union_fee_rate=$9, updated_at=NOW()
      WHERE id = 1 RETURNING *
    `, [year||2026, normal_hours_month||208, hours_per_day||8, inss_employee_rate??3, inss_employer_rate??4,
        overtime_50_rate??50, overtime_100_rate??100, night_work_rate??25, union_fee_rate??0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/payroll', authMiddleware, async (req, res) => {
  const { period_name, start_date, end_date, notes } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO payroll_periods (period_name, start_date, end_date, notes)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [period_name, start_date, end_date, notes||null]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Calcular IRPS Moçambique (tabela progressiva simplificada, 2024) ──────────
// Mantida só como reserva enquanto a tabela oficial de 2026 (abaixo) não estiver completa.
function calcIRPS(taxableIncome) {
  const annual = taxableIncome * 12;
  let irpsAnnual = 0;
  if (annual <= 42000)       irpsAnnual = 0;
  else if (annual <= 168000) irpsAnnual = (annual - 42000) * 0.10;
  else if (annual <= 504000) irpsAnnual = 12600 + (annual - 168000) * 0.15;
  else if (annual <= 1512000) irpsAnnual = 63000 + (annual - 504000) * 0.20;
  else if (annual <= 3024000) irpsAnnual = 264600 + (annual - 1512000) * 0.25;
  else                        irpsAnnual = 642600 + (annual - 3024000) * 0.32;
  return Math.round(irpsAnnual / 12 * 100) / 100;
}

// ── Calcular IRPS Moçambique 2026 (tabela oficial por escalão, mensal) ────────
// Fórmula: IRPS = valorFixo[escalão][dependentes] + (base − limiteInferior[escalão]) × coeficiente[escalão]
// ⚠️ TABELA INCOMPLETA — só o escalão 8 (0 dependentes) está confirmado (exemplo dado pelo
// cliente: bruto 35.000 MT → IRPS 2.225 MT). Faltam os restantes escalões e as colunas de
// valorFixo para 1/2/3+ dependentes. Preencher assim que o cliente enviar a tabela oficial completa.
const IRPS_TABLE_2026 = [
  // { escalao: 1, limiteInferior: 0, coeficiente: 0, valorFixo: [0, 0, 0, 0] },
  { escalao: 8, limiteInferior: 32750, coeficiente: 0.20, valorFixo: [1775] },
];

function calcIRPS2026(monthlyBase, dependentsCount = 0) {
  const sorted = [...IRPS_TABLE_2026].sort((a, b) => b.limiteInferior - a.limiteInferior);
  const bracket = sorted.find(b => monthlyBase >= b.limiteInferior);
  if (!bracket) {
    throw new Error(`Tabela de IRPS 2026 incompleta: nenhum escalão definido para a base ${monthlyBase} MT. Complete IRPS_TABLE_2026 em backend/routes/hr.js.`);
  }
  const dep = Math.min(dependentsCount, bracket.valorFixo.length - 1);
  const valorFixo = bracket.valorFixo[dep];
  if (valorFixo === undefined) {
    throw new Error(`Tabela de IRPS 2026 incompleta: escalão ${bracket.escalao} não tem valorFixo para ${dependentsCount} dependente(s).`);
  }
  const irps = valorFixo + (monthlyBase - bracket.limiteInferior) * bracket.coeficiente;
  return Math.round(irps * 100) / 100;
}

// ── Motor de cálculo do recibo (padrão Moçambique — horas extra, nocturno, absentismo) ─
// "Horas extra" (+50%/+100%) são horas fora do horário normal: pagas ao valor total da hora
// já com o acréscimo (Lei 13/2023 art. 122). "Adicional nocturno" é só o suplemento de 25%
// sobre horas já dentro do horário normal (por isso não leva a base da hora, só o acréscimo).
function computeSlipAmounts(input, cfg) {
  const base = Number(input.base_salary) || 0;
  const hourlyRate = Number(cfg.normal_hours_month) > 0 ? base / Number(cfg.normal_hours_month) : 0;
  const dailyRate = Number(cfg.hours_per_day) > 0 ? hourlyRate * Number(cfg.hours_per_day) : 0;

  const overtimeAmount = round2(
    (Number(input.overtime_hours_50) || 0)  * hourlyRate * (1 + Number(cfg.overtime_50_rate) / 100) +
    (Number(input.overtime_hours_100) || 0) * hourlyRate * (1 + Number(cfg.overtime_100_rate) / 100)
  );
  const nightAmount = round2((Number(input.night_hours) || 0) * hourlyRate * (Number(cfg.night_work_rate) / 100));

  const commissions   = Number(input.commissions) || 0;
  const variableBonus = Number(input.variable_bonus) || 0;
  const allowances     = Number(input.allowances) || 0;
  const grossTotal = round2(base + commissions + variableBonus + allowances + overtimeAmount + nightAmount);

  // Absentismo: horas injustificadas e atrasos descontam à hora; dias de falta não remunerada descontam ao dia.
  // Horas de ausência justificada não descontam — servem só para o relatório de absentismo.
  const absenceAmount = round2(
    (Number(input.absence_days_unpaid) || 0) * dailyRate +
    (Number(input.absence_hours_unjustified) || 0) * hourlyRate +
    (Number(input.late_hours) || 0) * hourlyRate
  );

  const inssBase = input.inss_base !== undefined && input.inss_base !== '' ? (Number(input.inss_base) || 0) : grossTotal;
  const inssRatePct = input.inss_exempt ? 0 : (input.inss_rate != null && input.inss_rate !== '' ? Number(input.inss_rate) : Number(cfg.inss_employee_rate));
  const inssEmp  = round2(inssBase * inssRatePct / 100);
  const inssEmpr = input.inss_exempt ? 0 : round2(inssBase * Number(cfg.inss_employer_rate) / 100);

  const unionFee = round2(grossTotal * Number(cfg.union_fee_rate) / 100);

  const otherDeductions = Number(input.other_deductions) || 0;
  const otherAdditions  = Number(input.other_additions) || 0;
  const advances        = Number(input.advances) || 0;

  const irps = input.irps != null && input.irps !== '' ? Number(input.irps) : 0; // preenchido/confirmado à parte (ver calcIRPS2026)

  const netSalary = round2(
    grossTotal - inssEmp - irps - unionFee - otherDeductions - advances - absenceAmount + otherAdditions
  );
  const employerCost = round2(grossTotal + inssEmpr);

  return {
    base_salary: base, gross_salary: grossTotal, inss_base: inssBase, inss_employee: inssEmp, inss_employer: inssEmpr,
    overtime_amount: overtimeAmount, night_amount: nightAmount, union_fee: unionFee, absence_amount: absenceAmount,
    employer_cost: employerCost, net_salary: netSalary,
  };
}
function round2(n) { return Math.round(n * 100) / 100; }

// Processar: gerar payslips para todos os funcionários activos
router.post('/payroll/:id/process', authMiddleware, async (req, res) => {
  try {
    const period = await pool.query(`SELECT * FROM payroll_periods WHERE id=$1`, [req.params.id]);
    if (!period.rows.length) return res.status(404).json({ error: 'Período não encontrado' });
    if (period.rows[0].status === 'closed') return res.status(400).json({ error: 'Período já fechado' });

    const cfg = await getPayrollConfig();
    const emps = await pool.query(`SELECT * FROM employees WHERE status='active'`);
    const slips = [];
    const failed = [];
    for (const emp of emps.rows) {
      try {
        const base = parseFloat(emp.salary) || 0;
        // A tabela oficial 2026 aplica-se directamente ao salário (confirmado pelo exemplo do
        // cliente: 35.000 bruto, escalão 8, excesso = 35.000 − 32.750 — não é bruto menos INSS).
        const irps = emp.irps_exempt ? 0
          : (emp.irps_rate != null ? Math.round(base * Number(emp.irps_rate) / 100 * 100) / 100 : calcIRPS2026(base, emp.dependents_count || 0));

        const a = computeSlipAmounts({
          base_salary: base, commissions: 0, variable_bonus: 0, allowances: 0,
          overtime_hours_50: 0, overtime_hours_100: 0, night_hours: 0,
          inss_exempt: emp.inss_exempt, inss_rate: emp.inss_rate,
          absence_days_unpaid: 0, absence_hours_unjustified: 0, late_hours: 0,
          other_deductions: 0, other_additions: 0, advances: 0, irps,
        }, cfg);

        await pool.query(`
          INSERT INTO payslips (period_id, employee_id, base_salary, gross_salary, inss_base, inss_employee, inss_employer, irps, overtime_amount, night_amount, union_fee, absence_amount, employer_cost, net_salary)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (period_id, employee_id) DO UPDATE
            SET base_salary=$3, gross_salary=$4, inss_base=$5, inss_employee=$6, inss_employer=$7, irps=$8,
                overtime_amount=$9, night_amount=$10, union_fee=$11, absence_amount=$12, employer_cost=$13, net_salary=$14, updated_at=NOW()
          RETURNING *
        `, [req.params.id, emp.id, a.base_salary, a.gross_salary, a.inss_base, a.inss_employee, a.inss_employer, irps,
            a.overtime_amount, a.night_amount, a.union_fee, a.absence_amount, a.employer_cost, a.net_salary]);
        slips.push({ employee: emp.full_name, gross: a.gross_salary, inssEmp: a.inss_employee, irps, net: a.net_salary });
      } catch (empErr) {
        // Não aborta o lote todo — regista quem falhou (ex: tabela de IRPS incompleta para o escalão) e continua os restantes.
        failed.push({ employee: emp.full_name, error: empErr.message });
      }
    }
    await pool.query(`UPDATE payroll_periods SET status='processing', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ processed: slips.length, slips, failed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Obter payslips de um período
router.get('/payroll/:id/payslips', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ps.*, e.full_name, e.job_title, e.nuit,
             d.name AS department_name
      FROM payslips ps
      JOIN employees e ON e.id = ps.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE ps.period_id = $1
      ORDER BY e.full_name
    `, [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Apagar um período (os recibos são removidos em cascata via FK)
router.delete('/payroll/:id', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM payroll_periods WHERE id=$1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Período não encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ajuste manual de um payslip — recalcula tudo (horas extra, nocturno, absentismo, INSS) ao padrão MZ
router.put('/payroll/payslips/:slipId', authMiddleware, async (req, res) => {
  const b = req.body;
  const num = (v, d = 0) => (v != null && v !== '' ? Number(v) : d);
  try {
    const cfg = await getPayrollConfig();
    // A taxa/isenção de INSS vem sempre do funcionário (não do formulário do recibo), para não
    // desfazer por acidente uma configuração personalizada ao editar horas/comissões do mês.
    const { rows: empRows } = await pool.query(
      `SELECT e.inss_exempt, e.inss_rate FROM payslips ps JOIN employees e ON e.id = ps.employee_id WHERE ps.id = $1`,
      [req.params.slipId]
    );
    if (!empRows.length) return res.status(404).json({ error: 'Recibo não encontrado' });
    const emp = empRows[0];

    const a = computeSlipAmounts({
      base_salary: num(b.base_salary), commissions: num(b.commissions), variable_bonus: num(b.variable_bonus), allowances: num(b.allowances),
      overtime_hours_50: num(b.overtime_hours_50), overtime_hours_100: num(b.overtime_hours_100), night_hours: num(b.night_hours),
      inss_base: b.inss_base, inss_rate: emp.inss_rate, inss_exempt: emp.inss_exempt,
      absence_days_unpaid: num(b.absence_days_unpaid), absence_hours_unjustified: num(b.absence_hours_unjustified), late_hours: num(b.late_hours),
      other_deductions: num(b.other_deductions), other_additions: num(b.other_additions), advances: num(b.advances),
      irps: b.irps,
    }, cfg);

    const { rows } = await pool.query(`
      UPDATE payslips SET
        base_salary=$1, gross_salary=$2, commissions=$3, variable_bonus=$4, allowances=$5,
        overtime_hours_50=$6, overtime_hours_100=$7, night_hours=$8, overtime_amount=$9, night_amount=$10,
        inss_base=$11, inss_employee=$12, inss_employer=$13, irps=$14, union_fee=$15,
        other_deductions=$16, other_additions=$17, advances=$18,
        absence_hours_justified=$19, absence_hours_unjustified=$20, absence_days_unpaid=$21, late_hours=$22, absence_amount=$23,
        employer_cost=$24, worked_days=$25, net_salary=$26, notes=$27, updated_at=NOW()
      WHERE id=$28 RETURNING *
    `, [a.base_salary, a.gross_salary, num(b.commissions), num(b.variable_bonus), num(b.allowances),
        num(b.overtime_hours_50), num(b.overtime_hours_100), num(b.night_hours), a.overtime_amount, a.night_amount,
        a.inss_base, a.inss_employee, a.inss_employer, num(b.irps), a.union_fee,
        num(b.other_deductions), num(b.other_additions), num(b.advances),
        num(b.absence_hours_justified), num(b.absence_hours_unjustified), num(b.absence_days_unpaid), num(b.late_hours), a.absence_amount,
        a.employer_cost, b.worked_days != null && b.worked_days !== '' ? Number(b.worked_days) : null,
        a.net_salary, b.notes || null, req.params.slipId]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marcar payslip como pago
router.put('/payroll/payslips/:slipId/pay', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE payslips SET status='paid', paid_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.slipId]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fechar período
router.put('/payroll/:id/close', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE payroll_periods SET status='closed', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
