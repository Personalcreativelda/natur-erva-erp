import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { generateDocumentPDF, generateReceiptPDF, loadLogoBuffer, drawBrandHeader } from '../services/pdfService.js';
import { computeBonusReport } from './incentives.js';

const router = Router();

const getTax = async () => {
  const { rows } = await pool.query('SELECT * FROM tax_config WHERE id = 1');
  const r = rows[0] || {};
  return {
    companyName:        r.company_name || '',
    companyNuit:        r.company_nuit || '',
    companyAddress:     r.company_address || '',
    companyPhone:       r.company_phone || '',
    companyEmail:       r.company_email || '',
    vatRate:            Number(r.vat_rate || 16),
    invoicePrefix:      r.invoice_prefix || 'FACT',
    bankName:           r.bank_name || '',
    bankAccount:        r.bank_account || '',
    bankIban:           r.bank_iban || '',
    bankAccountHolder:  r.bank_account_holder || '',
    bankAccounts:       Array.isArray(r.bank_accounts) ? r.bank_accounts : [],
    logoUrl:            r.logo_url || '',
  };
};

const send = (res, buf, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
};

// GET /api/pdf/order/:id — fatura de encomenda
router.get('/order/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Encomenda não encontrada' });
    const o   = rows[0];
    const tax = await getTax();

    const items = (o.items || []).map(i => ({
      name:       i.productName || i.name || '',
      variantName: i.variantName,
      quantity:   i.quantity || 1,
      unitPrice:  Number(i.price || 0),
      vatRate:    tax.vatRate,
    }));

    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const buf = await generateDocumentPDF({
      type:   'invoice',
      number: o.order_number || `${tax.invoicePrefix}-${o.id.slice(0, 8).toUpperCase()}`,
      doc:    { customerName: o.customer_name, customerPhone: o.customer_phone, notes: o.notes },
      taxConfig: tax,
      items,
      totals: {
        subtotal,
        discount:    Number(o.discount_amount || 0),
        deliveryFee: Number(o.delivery_fee    || 0),
        total:       Number(o.total_amount    || 0),
        vatRate:     tax.vatRate,
      },
    });
    send(res, buf, `fatura-${o.order_number || o.id.slice(0, 8)}.pdf`);
  } catch (err) { console.error('[PDF/order]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/invoice/:id — fatura formal (tabela invoices)
router.get('/invoice/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, o.order_number FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Fatura não encontrada' });
    const inv = rows[0];
    const tax = await getTax();

    const items = (inv.items || []).map(i => ({
      name:       i.name || i.productName || '',
      variantName: i.variantName,
      quantity:   i.quantity || 1,
      unitPrice:  Number(i.unitPrice || i.price || 0),
      vatRate:    tax.vatRate,
    }));

    const subtotal = Number(inv.subtotal || 0);
    const buf = await generateDocumentPDF({
      type:   'invoice',
      number: inv.invoice_number,
      doc: {
        customerName:    inv.customer_name,
        customerPhone:   inv.customer_phone,
        customerEmail:   inv.customer_email,
        customerNuit:    inv.customer_nuit,
        customerAddress: inv.customer_address,
        notes:           inv.notes,
      },
      taxConfig: tax,
      items,
      totals: {
        subtotal,
        discount:    Number(inv.discount_amount || 0),
        deliveryFee: Number(inv.delivery_fee    || 0),
        total:       Number(inv.total_amount    || 0),
        vatRate:     tax.vatRate,
      },
    });
    send(res, buf, `fatura-${inv.invoice_number}.pdf`);
  } catch (err) { console.error('[PDF/invoice]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/clinic-invoice/:id — recibo da Clínica
router.get('/clinic-invoice/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clinic_invoices WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Fatura não encontrada' });
    const inv = rows[0];
    const tax = await getTax();

    const items = (inv.items || []).map(i => ({
      name:      i.name || '',
      quantity:  i.quantity || 1,
      unitPrice: Number(i.unitPrice || 0),
      vatRate:   0,
    }));

    const buf = await generateDocumentPDF({
      type:   'invoice',
      number: inv.invoice_number,
      doc: {
        customerName:  inv.customer_name,
        customerPhone: inv.customer_phone,
        notes:         inv.notes,
      },
      taxConfig: tax,
      items,
      totals: {
        subtotal: Number(inv.subtotal || 0),
        discount: Number(inv.discount || 0),
        total:    Number(inv.total    || 0),
        vatRate:  0,
      },
    });
    send(res, buf, `recibo-clinica-${inv.invoice_number}.pdf`);
  } catch (err) { console.error('[PDF/clinic-invoice]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/quote/:id — orçamento
router.get('/quote/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const q   = rows[0];
    const tax = await getTax();

    const items = (q.items || []).map(i => ({
      name:       i.name || i.productName || '',
      variantName: i.variantName,
      quantity:   i.quantity || 1,
      unitPrice:  Number(i.unitPrice || i.price || 0),
      vatRate:    tax.vatRate,
    }));

    const buf = await generateDocumentPDF({
      type:   'quote',
      number: q.quote_number,
      doc: {
        customerName:  q.customer_name,
        customerPhone: q.customer_phone,
        customerNuit:  q.customer_nuit,
        customerEmail: q.customer_email,
        notes:         q.notes,
      },
      taxConfig: tax,
      items,
      totals: {
        subtotal:    Number(q.subtotal),
        discount:    Number(q.discount),
        deliveryFee: 0,
        total:       Number(q.total),
        vatRate:     tax.vatRate,
      },
      extra: {
        validUntil: q.valid_until
          ? new Date(q.valid_until).toLocaleDateString('pt-MZ') : null,
      },
    });
    send(res, buf, `orcamento-${q.quote_number}.pdf`);
  } catch (err) { console.error('[PDF/quote]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/pos-session/:id?format=A4|80mm — recibo de sessão POS
router.get('/pos-session/:id', authMiddleware, async (req, res) => {
  try {
    const format = req.query.format === '80mm' ? '80mm' : 'A4';
    const { rows: sessions } = await pool.query('SELECT * FROM pos_sessions WHERE id = $1', [req.params.id]);
    if (!sessions.length) return res.status(404).json({ error: 'Sessão não encontrada' });
    const session = sessions[0];

    const { rows: orders } = await pool.query(
      `SELECT * FROM orders
       WHERE source = 'pos'
         AND created_at >= $1
         AND (($2::timestamptz IS NULL) OR created_at <= $2)
         AND status NOT IN ('cancelled')
       ORDER BY created_at ASC`,
      [session.opened_at, session.closed_at || null]
    );

    const tax = await getTax();
    const buf = await generateReceiptPDF({ session, orders, taxConfig: tax, format });
    const date = new Date(session.opened_at).toISOString().slice(0, 10);
    send(res, buf, `sessao-pos-${date}.pdf`);
  } catch (err) { console.error('[PDF/pos-session]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/vat-report?month=YYYY-MM — relatório de IVA mensal em PDF
router.get('/vat-report', authMiddleware, async (req, res) => {
  try {
    const month = (req.query.month || new Date().toISOString().slice(0, 7));
    const from  = `${month}-01`;
    const toDate = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0);
    const to    = toDate.toISOString().slice(0, 10);
    const tax   = await getTax();
    const vatRate = tax.vatRate;

    const { rows } = await pool.query(
      `SELECT o.order_number, o.created_at, o.customer_name,
              o.payment_method, o.total_amount, o.discount_amount
       FROM orders o
       WHERE o.created_at::date >= $1 AND o.created_at::date <= $2
         AND o.status NOT IN ('cancelled')
       ORDER BY o.created_at ASC`,
      [from, to]
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const totalVat     = totalRevenue * vatRate / (100 + vatRate);
    const totalNet     = totalRevenue - totalVat;
    const logoBuf = await loadLogoBuffer(tax.logoUrl);

    // Build the PDF inline using the same pdfkit dependency
    const { default: PDFDocument } = await import('pdfkit');
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    pdf.on('data', c => chunks.push(c));

    await new Promise((ok, err) => {
      pdf.on('end', ok);
      pdf.on('error', err);

      const PW = pdf.page.width - 100;
      const LM = 50;

      // Cabeçalho — mesmo padrão (logótipo + dados de Finanças) dos restantes documentos
      const headerBottom = drawBrandHeader(pdf, tax, logoBuf, { LM });
      pdf.fontSize(16).fillColor('#1d1d1f').text('RELATÓRIO DE IVA', LM, 50, { align: 'right', width: PW });
      pdf.fontSize(9).fillColor('#6e6e73').text(`Período: ${month}`, LM, 72, { align: 'right', width: PW });
      const dividerY = Math.max(115, headerBottom + 6);
      pdf.moveTo(LM, dividerY).lineTo(LM + PW, dividerY).strokeColor('#d2d2d7').lineWidth(1).stroke();

      // KPI cards
      let y = dividerY + 15;
      const cw = (PW - 20) / 3;
      const card = (x, bg, label, value, color) => {
        pdf.rect(x, y, cw, 52).fillColor(bg).fill();
        pdf.fontSize(8).fillColor('#6e6e73').text(label, x + 8, y + 7);
        pdf.fontSize(13).fillColor(color).font('Helvetica-Bold').text(value, x + 8, y + 22, { width: cw - 16 });
        pdf.font('Helvetica');
      };
      card(LM,          '#f0fdf4', 'TOTAL BRUTO',       `${totalRevenue.toFixed(2)} MT`, '#059669');
      card(LM + cw + 10, '#fef3c7', `IVA (${vatRate}%)`, `${totalVat.toFixed(2)} MT`,     '#d97706');
      card(LM + (cw+10)*2,'#eff6ff', 'BASE TRIBUTÁVEL',   `${totalNet.toFixed(2)} MT`,     '#2563eb');
      y += 62;
      pdf.fontSize(8).fillColor('#1d1d1f').text(`Nº de documentos: ${rows.length}`, LM, y);
      y += 20;

      // Table header
      pdf.rect(LM, y, PW, 18).fillColor('#059669').fill();
      pdf.fontSize(7.5).fillColor('#ffffff');
      pdf.text('Nº DOC',   LM + 4, y + 5, { width: 70 });
      pdf.text('DATA',     LM + 80, y + 5, { width: 65 });
      pdf.text('CLIENTE',  LM + 152, y + 5, { width: 130 });
      pdf.text('BASE',     LM + PW - 130, y + 5, { width: 58, align: 'right' });
      pdf.text('IVA',      LM + PW - 68,  y + 5, { width: 38, align: 'right' });
      pdf.text('TOTAL',    LM + PW - 28,  y + 5, { width: 40, align: 'right' });
      y += 20;

      let alt = false;
      for (const r of rows) {
        if (y > pdf.page.height - 80) { pdf.addPage(); y = 50; }
        if (alt) pdf.rect(LM, y, PW, 14).fillColor('#f9fafb').fill();
        alt = !alt;

        const tot = Number(r.total_amount || 0);
        const vat = tot * vatRate / (100 + vatRate);
        const net = tot - vat;

        pdf.fontSize(7.5).fillColor('#1d1d1f');
        pdf.text(r.order_number || r.id?.slice(0, 8) || '—', LM + 4, y + 3, { width: 70 });
        pdf.text(new Date(r.created_at).toLocaleDateString('pt-MZ'), LM + 80, y + 3, { width: 65 });
        pdf.text(r.customer_name || '—', LM + 152, y + 3, { width: 130, ellipsis: true });
        pdf.fillColor('#6e6e73');
        pdf.text(net.toFixed(2), LM + PW - 130, y + 3, { width: 58, align: 'right' });
        pdf.text(vat.toFixed(2), LM + PW - 68,  y + 3, { width: 38, align: 'right' });
        pdf.fillColor('#1d1d1f').text(tot.toFixed(2), LM + PW - 28, y + 3, { width: 40, align: 'right' });
        y += 14;
      }

      // Totals row
      y += 6;
      pdf.moveTo(LM + PW - 165, y).lineTo(LM + PW, y).strokeColor('#059669').lineWidth(1).stroke(); y += 6;
      pdf.fontSize(8).font('Helvetica-Bold').fillColor('#6e6e73').text('TOTAIS:', LM + PW - 165, y);
      pdf.text(totalNet.toFixed(2),     LM + PW - 130, y, { width: 58, align: 'right' });
      pdf.text(totalVat.toFixed(2),     LM + PW - 68,  y, { width: 38, align: 'right' });
      pdf.fillColor('#059669').text(totalRevenue.toFixed(2), LM + PW - 28, y, { width: 40, align: 'right' });
      pdf.font('Helvetica');

      // Footer
      const FY = pdf.page.height - 48;
      pdf.moveTo(LM, FY).lineTo(LM + PW, FY).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
      pdf.fontSize(6.5).fillColor('#6e6e73')
        .text(`Gerado em ${new Date().toLocaleString('pt-MZ')} · ${tax.companyName} NUIT: ${tax.companyNuit}`, LM, FY + 8, { align: 'center', width: PW });

      pdf.end();
    });

    const buf = Buffer.concat(chunks);
    send(res, buf, `relatorio-iva-${month}.pdf`);
  } catch (err) { console.error('[PDF/vat-report]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/payroll-slip/:id — recibo de vencimento individual
router.get('/payroll-slip/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ps.*, e.full_name, e.job_title, e.nuit AS employee_nuit, e.hire_date,
              e.inss_exempt, e.irps_exempt, e.inss_rate, e.irps_rate,
              e.payment_method, e.bank_name, e.bank_nib, e.bank_account, e.mpesa_number, e.emola_number,
              d.name AS department_name, pp.period_name, pp.start_date, pp.end_date
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
       JOIN payroll_periods pp ON pp.id = ps.period_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE ps.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Recibo não encontrado' });
    const s = rows[0];
    const tax = await getTax();
    const logoBuf = await loadLogoBuffer(tax.logoUrl);

    const gross      = Number(s.gross_salary || 0);
    const inss       = Number(s.inss_employee || 0);
    const irps       = Number(s.irps || 0);
    const otherDed   = Number(s.other_deductions || 0);
    const otherAdd   = Number(s.other_additions || 0);
    const net        = Number(s.net_salary || 0);
    const totalDed   = inss + irps + otherDed;

    // Percentagens a descontar (para exibição nas rubricas)
    const inssPct    = s.inss_exempt ? 0 : (s.inss_rate != null ? Number(s.inss_rate) : 3);
    const inssLabel  = s.inss_exempt ? 'INSS (isento)' : `INSS Funcionário (${inssPct}%)`;
    const irpsLabel  = s.irps_exempt ? 'IRPS (isento)'
      : (s.irps_rate != null ? `IRPS (${Number(s.irps_rate)}%)` : 'IRPS (tabela progressiva)');

    const { default: PDFDocument } = await import('pdfkit');
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    pdf.on('data', c => chunks.push(c));

    await new Promise((ok, err) => {
      pdf.on('end', ok);
      pdf.on('error', err);

      const PW = pdf.page.width - 100;
      const LM = 50;

      // Cabeçalho — mesmo padrão (logótipo + dados de Finanças) das faturas/recibos
      const headerBottom = drawBrandHeader(pdf, tax, logoBuf, { LM });
      pdf.fontSize(16).fillColor('#1d1d1f').text('RECIBO DE VENCIMENTO', LM, 50, { align: 'right', width: PW });
      pdf.fontSize(9).fillColor('#6e6e73').text(s.period_name || '', LM, 72, { align: 'right', width: PW });
      pdf.text(
        `${new Date(s.start_date).toLocaleDateString('pt-MZ')} — ${new Date(s.end_date).toLocaleDateString('pt-MZ')}`,
        LM, 86, { align: 'right', width: PW }
      );
      const dividerY = Math.max(115, headerBottom + 6);
      pdf.moveTo(LM, dividerY).lineTo(LM + PW, dividerY).strokeColor('#d2d2d7').lineWidth(1).stroke();

      // Dados do funcionário
      let y = dividerY + 15;
      pdf.fontSize(9).fillColor('#6e6e73').text('FUNCIONÁRIO', LM, y);
      y += 14;
      pdf.fontSize(11).fillColor('#1d1d1f').font('Helvetica-Bold').text(s.full_name || '—', LM, y);
      pdf.font('Helvetica');
      y += 16;
      pdf.fontSize(8.5).fillColor('#6e6e73');
      if (s.job_title) { pdf.text(`Cargo: ${s.job_title}`, LM, y); y += 12; }
      if (s.department_name) { pdf.text(`Departamento: ${s.department_name}`, LM, y); y += 12; }
      if (s.employee_nuit) { pdf.text(`NUIT: ${s.employee_nuit}`, LM, y); y += 12; }
      if (s.hire_date) { pdf.text(`Data de Admissão: ${new Date(s.hire_date).toLocaleDateString('pt-MZ')}`, LM, y); y += 12; }
      pdf.font('Helvetica-Bold').fillColor('#1d1d1f').text(`Mês de Referência: ${s.period_name || '—'}`, LM, y);
      pdf.font('Helvetica');
      y += 12;
      y += 12;

      // Tabela de rubricas
      pdf.rect(LM, y, PW, 18).fillColor('#059669').fill();
      pdf.fontSize(8).fillColor('#ffffff');
      pdf.text('DESCRIÇÃO', LM + 8, y + 5, { width: PW - 130 });
      pdf.text('VALOR (MT)', LM + PW - 100, y + 5, { width: 92, align: 'right' });
      y += 18;

      const row = (label, value, opts = {}) => {
        if (opts.shaded) { pdf.rect(LM, y, PW, 16).fillColor('#f9fafb').fill(); }
        pdf.fontSize(8.5).fillColor(opts.color || '#1d1d1f').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
        pdf.text(label, LM + 8, y + 4, { width: PW - 130 });
        pdf.text(value, LM + PW - 100, y + 4, { width: 92, align: 'right' });
        pdf.font('Helvetica');
        y += 16;
      };

      row('Salário Bruto', gross.toFixed(2), { shaded: true, bold: true });
      row(inssLabel, `-${inss.toFixed(2)}`, { color: '#dc2626' });
      row(irpsLabel, `-${irps.toFixed(2)}`, { color: '#dc2626', shaded: true });
      if (otherDed) row('Outras Deduções', `-${otherDed.toFixed(2)}`, { color: '#dc2626' });
      if (otherAdd) row('Outros Adicionais', `+${otherAdd.toFixed(2)}`, { color: '#059669', shaded: !!otherDed });

      y += 4;
      pdf.moveTo(LM, y).lineTo(LM + PW, y).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
      y += 8;
      pdf.fontSize(8).fillColor('#6e6e73').text(`Total de Deduções: ${totalDed.toFixed(2)} MT`, LM, y);
      y += 20;

      // Líquido a receber — destaque
      pdf.rect(LM, y, PW, 34).fillColor('#f0fdf4').fill();
      pdf.fontSize(9).fillColor('#6e6e73').text('LÍQUIDO A RECEBER', LM + 12, y + 9);
      pdf.fontSize(15).fillColor('#059669').font('Helvetica-Bold').text(`${net.toFixed(2)} MT`, LM, y + 8, { width: PW - 12, align: 'right' });
      pdf.font('Helvetica');
      y += 46;

      pdf.fontSize(7.5).fillColor('#6e6e73').text(
        `Estado: ${s.status === 'paid' ? 'Pago' : 'Pendente'}${s.paid_at ? ` em ${new Date(s.paid_at).toLocaleDateString('pt-MZ')}` : ''}`,
        LM, y
      );
      y += 20;

      // Dados de pagamento — para envio ao banco/operadora
      const PAY_METHOD_LABELS = { bank: 'Transferência Bancária', mpesa: 'M-Pesa', emola: 'e-Mola', cash: 'Numerário' };
      const payLines = [];
      if (s.payment_method === 'bank') {
        if (s.bank_name)    payLines.push(`Banco: ${s.bank_name}`);
        if (s.bank_nib)     payLines.push(`NIB: ${s.bank_nib}`);
        if (s.bank_account) payLines.push(`Nº de Conta: ${s.bank_account}`);
      } else if (s.payment_method === 'mpesa' && s.mpesa_number) {
        payLines.push(`Número M-Pesa: ${s.mpesa_number}`);
      } else if (s.payment_method === 'emola' && s.emola_number) {
        payLines.push(`Número e-Mola: ${s.emola_number}`);
      }

      pdf.moveTo(LM, y).lineTo(LM + PW, y).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
      y += 10;
      pdf.fontSize(9).fillColor('#6e6e73').text('DADOS DE PAGAMENTO', LM, y);
      y += 14;
      pdf.fontSize(8.5).fillColor('#1d1d1f').font('Helvetica-Bold')
        .text(`Método: ${PAY_METHOD_LABELS[s.payment_method] || '—'}`, LM, y);
      pdf.font('Helvetica');
      y += 12;
      pdf.fontSize(8.5).fillColor('#6e6e73');
      for (const line of payLines) { pdf.text(line, LM, y); y += 12; }

      // Rodapé
      const FY = pdf.page.height - 48;
      pdf.moveTo(LM, FY).lineTo(LM + PW, FY).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
      pdf.fontSize(6.5).fillColor('#6e6e73')
        .text(`Gerado em ${new Date().toLocaleString('pt-MZ')}${tax.companyName ? ` · ${tax.companyName}` : ''}${tax.companyNuit ? ` NUIT: ${tax.companyNuit}` : ''}`, LM, FY + 8, { align: 'center', width: PW });

      pdf.end();
    });

    const buf = Buffer.concat(chunks);
    const safeName = (s.full_name || 'funcionario').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
    send(res, buf, `recibo-vencimento-${safeName}-${s.period_name || s.id}.pdf`);
  } catch (err) { console.error('[PDF/payroll-slip]', err); res.status(500).json({ error: err.message }); }
});

// ── Folhas de INSS / IRPS por período ─────────────────────────────────────────

const safeFileName = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'periodo';

// Busca período + recibos com dados fiscais dos funcionários
async function getPeriodSheetData(periodId) {
  const { rows: periods } = await pool.query('SELECT * FROM payroll_periods WHERE id = $1', [periodId]);
  if (!periods.length) return null;
  const { rows: slips } = await pool.query(
    `SELECT ps.gross_salary, ps.inss_employee, ps.inss_employer, ps.irps, ps.net_salary,
            e.full_name, e.nuit, e.inss_exempt, e.irps_exempt, e.inss_rate, e.irps_rate,
            e.payment_method, e.bank_name, e.bank_nib, e.bank_account, e.mpesa_number, e.emola_number
     FROM payslips ps
     JOIN employees e ON e.id = ps.employee_id
     WHERE ps.period_id = $1
     ORDER BY e.full_name`,
    [periodId]
  );
  return { period: periods[0], slips };
}

/**
 * Gera uma folha tabular (INSS ou IRPS) no mesmo padrão visual dos restantes documentos.
 * columns: [{ label, width (fração de PW), align?, value(slip) }]; totals: idem por coluna (ou null).
 */
async function buildSheetPDF({ title, period, slips, tax, columns, totalsRow }) {
  const logoBuf = await loadLogoBuffer(tax.logoUrl);
  const { default: PDFDocument } = await import('pdfkit');
  const pdf = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];
  pdf.on('data', c => chunks.push(c));

  await new Promise((ok, err) => {
    pdf.on('end', ok);
    pdf.on('error', err);

    const PW = pdf.page.width - 100;
    const LM = 50;

    const headerBottom = drawBrandHeader(pdf, tax, logoBuf, { LM });
    pdf.fontSize(16).fillColor('#1d1d1f').text(title, LM, 50, { align: 'right', width: PW });
    pdf.fontSize(9).fillColor('#6e6e73').text(`Mês de Referência: ${period.period_name || ''}`, LM, 72, { align: 'right', width: PW });
    pdf.text(
      `${new Date(period.start_date).toLocaleDateString('pt-MZ')} — ${new Date(period.end_date).toLocaleDateString('pt-MZ')}`,
      LM, 86, { align: 'right', width: PW }
    );
    const dividerY = Math.max(115, headerBottom + 6);
    pdf.moveTo(LM, dividerY).lineTo(LM + PW, dividerY).strokeColor('#d2d2d7').lineWidth(1).stroke();

    let y = dividerY + 15;

    // Posições X acumuladas por coluna
    const xs = [];
    let acc = LM;
    for (const col of columns) { xs.push(acc); acc += PW * col.width; }

    const drawHeadRow = () => {
      pdf.rect(LM, y, PW, 18).fillColor('#059669').fill();
      pdf.fontSize(7.5).fillColor('#ffffff');
      columns.forEach((col, i) => {
        pdf.text(col.label, xs[i] + 4, y + 5, { width: PW * col.width - 8, align: col.align || 'left' });
      });
      y += 18;
    };

    drawHeadRow();

    let alt = false;
    for (const slip of slips) {
      if (y > pdf.page.height - 90) { pdf.addPage(); y = 50; drawHeadRow(); alt = false; }
      if (alt) pdf.rect(LM, y, PW, 16).fillColor('#f9fafb').fill();
      alt = !alt;
      pdf.fontSize(7.5).fillColor('#1d1d1f');
      columns.forEach((col, i) => {
        pdf.text(String(col.value(slip)), xs[i] + 4, y + 4, { width: PW * col.width - 8, align: col.align || 'left', ellipsis: true });
      });
      y += 16;
    }

    // Totais
    y += 4;
    pdf.moveTo(LM, y).lineTo(LM + PW, y).strokeColor('#059669').lineWidth(1).stroke();
    y += 6;
    pdf.fontSize(7.5).font('Helvetica-Bold').fillColor('#1d1d1f');
    columns.forEach((col, i) => {
      const v = totalsRow[i];
      if (v != null) pdf.text(String(v), xs[i] + 4, y + 2, { width: PW * col.width - 8, align: col.align || 'left' });
    });
    pdf.font('Helvetica');
    y += 18;
    pdf.fontSize(7.5).fillColor('#6e6e73').text(`${slips.length} funcionário${slips.length !== 1 ? 's' : ''}`, LM, y);

    // Rodapé
    const FY = pdf.page.height - 48;
    pdf.moveTo(LM, FY).lineTo(LM + PW, FY).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
    pdf.fontSize(6.5).fillColor('#6e6e73')
      .text(`Gerado em ${new Date().toLocaleString('pt-MZ')}${tax.companyName ? ` · ${tax.companyName}` : ''}${tax.companyNuit ? ` NUIT: ${tax.companyNuit}` : ''}`, LM, FY + 8, { align: 'center', width: PW });

    pdf.end();
  });

  return Buffer.concat(chunks);
}

// GET /api/pdf/payroll-inss/:periodId — folha de INSS do período
router.get('/payroll-inss/:periodId', authMiddleware, async (req, res) => {
  try {
    const data = await getPeriodSheetData(req.params.periodId);
    if (!data) return res.status(404).json({ error: 'Período não encontrado' });
    const { period, slips } = data;
    const tax = await getTax();

    const inssPct = (s) => s.inss_exempt ? 0 : (s.inss_rate != null ? Number(s.inss_rate) : 3);
    const sum = (fn) => slips.reduce((t, s) => t + fn(s), 0);
    const totGross = sum(s => Number(s.gross_salary || 0));
    const totEmp   = sum(s => Number(s.inss_employee || 0));
    const totEmpr  = sum(s => Number(s.inss_employer || 0));

    const buf = await buildSheetPDF({
      title: 'FOLHA DE INSS', period, slips, tax,
      columns: [
        { label: 'FUNCIONÁRIO',       width: 0.26, value: s => s.full_name || '—' },
        { label: 'NUIT',              width: 0.12, value: s => s.nuit || '—' },
        { label: 'SALÁRIO BRUTO',     width: 0.14, align: 'right', value: s => Number(s.gross_salary || 0).toFixed(2) },
        { label: 'TAXA (%)',          width: 0.10, align: 'right', value: s => `${inssPct(s)}%` },
        { label: 'INSS FUNC.',        width: 0.13, align: 'right', value: s => Number(s.inss_employee || 0).toFixed(2) },
        { label: 'INSS ENTID. (4%)',  width: 0.13, align: 'right', value: s => Number(s.inss_employer || 0).toFixed(2) },
        { label: 'TOTAL',             width: 0.12, align: 'right', value: s => (Number(s.inss_employee || 0) + Number(s.inss_employer || 0)).toFixed(2) },
      ],
      totalsRow: ['TOTAIS', null, totGross.toFixed(2), null, totEmp.toFixed(2), totEmpr.toFixed(2), (totEmp + totEmpr).toFixed(2)],
    });
    send(res, buf, `folha-inss-${safeFileName(period.period_name)}.pdf`);
  } catch (err) { console.error('[PDF/payroll-inss]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/payroll-sheet/:periodId — folha de salários (dados de pagamento, para enviar ao banco)
router.get('/payroll-sheet/:periodId', authMiddleware, async (req, res) => {
  try {
    const data = await getPeriodSheetData(req.params.periodId);
    if (!data) return res.status(404).json({ error: 'Período não encontrado' });
    const { period, slips } = data;
    const tax = await getTax();

    const METHOD_LABELS = { bank: 'Banco', mpesa: 'M-Pesa', emola: 'e-Mola', cash: 'Numerário' };
    const accountOf = (s) =>
      s.payment_method === 'bank'  ? (s.bank_account || '—') :
      s.payment_method === 'mpesa' ? (s.mpesa_number || '—') :
      s.payment_method === 'emola' ? (s.emola_number || '—') : '—';
    const totNet = slips.reduce((t, s) => t + Number(s.net_salary || 0), 0);

    const buf = await buildSheetPDF({
      title: 'FOLHA DE SALÁRIOS', period, slips, tax,
      columns: [
        { label: 'FUNCIONÁRIO',       width: 0.24, value: s => s.full_name || '—' },
        { label: 'MÉTODO',            width: 0.11, value: s => METHOD_LABELS[s.payment_method] || '—' },
        { label: 'BANCO',             width: 0.14, value: s => s.payment_method === 'bank' ? (s.bank_name || '—') : '—' },
        { label: 'NIB',               width: 0.17, value: s => s.payment_method === 'bank' ? (s.bank_nib || '—') : '—' },
        { label: 'CONTA / CARTEIRA',  width: 0.18, value: accountOf },
        { label: 'LÍQUIDO (MT)',      width: 0.16, align: 'right', value: s => Number(s.net_salary || 0).toFixed(2) },
      ],
      totalsRow: ['TOTAL A PAGAR', null, null, null, null, totNet.toFixed(2)],
    });
    send(res, buf, `folha-salarios-${safeFileName(period.period_name)}.pdf`);
  } catch (err) { console.error('[PDF/payroll-sheet]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/pdf/payroll-irps/:periodId — folha de IRPS do período
router.get('/payroll-irps/:periodId', authMiddleware, async (req, res) => {
  try {
    const data = await getPeriodSheetData(req.params.periodId);
    if (!data) return res.status(404).json({ error: 'Período não encontrado' });
    const { period, slips } = data;
    const tax = await getTax();

    const irpsPctLabel = (s) => s.irps_exempt ? 'isento' : (s.irps_rate != null ? `${Number(s.irps_rate)}%` : 'tabela');
    const sum = (fn) => slips.reduce((t, s) => t + fn(s), 0);
    const totGross = sum(s => Number(s.gross_salary || 0));
    const totBase  = sum(s => Number(s.gross_salary || 0) - Number(s.inss_employee || 0));
    const totIrps  = sum(s => Number(s.irps || 0));

    const buf = await buildSheetPDF({
      title: 'FOLHA DE IRPS', period, slips, tax,
      columns: [
        { label: 'FUNCIONÁRIO',    width: 0.28, value: s => s.full_name || '—' },
        { label: 'NUIT',           width: 0.13, value: s => s.nuit || '—' },
        { label: 'SALÁRIO BRUTO',  width: 0.15, align: 'right', value: s => Number(s.gross_salary || 0).toFixed(2) },
        { label: 'BASE TRIBUT.',   width: 0.15, align: 'right', value: s => (Number(s.gross_salary || 0) - Number(s.inss_employee || 0)).toFixed(2) },
        { label: 'TAXA (%)',       width: 0.13, align: 'right', value: irpsPctLabel },
        { label: 'IRPS',           width: 0.16, align: 'right', value: s => Number(s.irps || 0).toFixed(2) },
      ],
      totalsRow: ['TOTAIS', null, totGross.toFixed(2), totBase.toFixed(2), null, totIrps.toFixed(2)],
    });
    send(res, buf, `folha-irps-${safeFileName(period.period_name)}.pdf`);
  } catch (err) { console.error('[PDF/payroll-irps]', err); res.status(500).json({ error: err.message }); }
});

// ── Ficha de consulta clínica (módulo Clínica) ────────────────────────────────

const SEX_LABELS = { feminino: 'Feminino', masculino: 'Masculino' };
const BIORESONANCE_STATUS_LABELS = { normal: 'Normal', baixo: 'Baixo', elevado: 'Elevado/Alterado' };

function calcAge(birthDate, atDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const a = atDate ? new Date(atDate) : new Date();
  let age = a.getFullYear() - b.getFullYear();
  const m = a.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < b.getDate())) age--;
  return age;
}

async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Desenha uma mini-tabela (secção) com quebra de página automática. Devolve o novo Y.
function drawRecordTable(pdf, { LM, PW }, startY, columns, rows, emptyLabel) {
  let y = startY;
  const xs = [];
  let acc = LM;
  for (const col of columns) { xs.push(acc); acc += PW * col.width; }

  const drawHead = () => {
    pdf.rect(LM, y, PW, 16).fillColor('#059669').fill();
    pdf.fontSize(7).fillColor('#ffffff');
    columns.forEach((col, i) => pdf.text(col.label, xs[i] + 4, y + 4, { width: PW * col.width - 8 }));
    y += 16;
  };

  if (!rows.length) {
    pdf.fontSize(8).fillColor('#6e6e73').text(emptyLabel, LM, y);
    return y + 16;
  }

  drawHead();
  let alt = false;
  for (const rowValues of rows) {
    if (y > pdf.page.height - 90) { pdf.addPage(); y = 50; drawHead(); alt = false; }
    if (alt) pdf.rect(LM, y, PW, 15).fillColor('#f9fafb').fill();
    alt = !alt;
    pdf.fontSize(7.5).fillColor('#1d1d1f');
    columns.forEach((col, i) => pdf.text(String(rowValues[i] ?? '—'), xs[i] + 4, y + 3, { width: PW * col.width - 8, ellipsis: true }));
    y += 15;
  }
  return y + 6;
}

// GET /api/pdf/clinic-record/:id — ficha de consulta (histórico do paciente)
router.get('/clinic-record/:id', authMiddleware, requirePermission('clinic.view'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cr.*, cp.file_number, cp.birth_date, cp.sex, cp.profession, cp.allergies AS patient_allergies,
              c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM clinical_records cr
       JOIN clinic_patients cp ON cp.id = cr.patient_id
       JOIN customers c ON c.id = cp.customer_id
       WHERE cr.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registo não encontrado' });
    const r = rows[0];
    const d = r.data || {};
    const tax = await getTax();
    const logoBuf = await loadLogoBuffer(tax.logoUrl);

    const productIds = (d.recommendedProducts || []).map(p => p.productId).filter(Boolean);
    let productNames = {};
    if (productIds.length) {
      const { rows: prodRows } = await pool.query('SELECT id, name FROM products WHERE id = ANY($1::uuid[])', [productIds]);
      productNames = Object.fromEntries(prodRows.map(p => [p.id, p.name]));
    }

    // Pré-carrega as imagens anexadas (fetch é assíncrono; o desenho do PDF é síncrono)
    const attachments = r.attachments || [];
    const attachmentBuffers = await Promise.all(
      attachments.map(att => (att.mimetype || '').startsWith('image/') ? fetchImageBuffer(att.url) : Promise.resolve(null))
    );

    const { default: PDFDocument } = await import('pdfkit');
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    pdf.on('data', c => chunks.push(c));

    await new Promise((ok, err) => {
      pdf.on('end', ok);
      pdf.on('error', err);

      const PW = pdf.page.width - 100;
      const LM = 50;
      const ensureSpace = (needed) => { if (y > pdf.page.height - needed) { pdf.addPage(); y = 50; } };

      const headerBottom = drawBrandHeader(pdf, tax, logoBuf, { LM });
      pdf.fontSize(16).fillColor('#1d1d1f').text('FICHA DE CONSULTA', LM, 50, { align: 'right', width: PW });
      pdf.fontSize(9).fillColor('#6e6e73').text(d.consultationDate ? new Date(d.consultationDate).toLocaleDateString('pt-MZ') : new Date(r.created_at).toLocaleDateString('pt-MZ'), LM, 72, { align: 'right', width: PW });
      const dividerY = Math.max(115, headerBottom + 6);
      pdf.moveTo(LM, dividerY).lineTo(LM + PW, dividerY).strokeColor('#d2d2d7').lineWidth(1).stroke();

      let y = dividerY + 15;

      const sectionTitle = (title) => {
        ensureSpace(60);
        pdf.fontSize(9).fillColor('#059669').font('Helvetica-Bold').text(title, LM, y);
        pdf.font('Helvetica');
        y += 14;
      };
      const field = (label, value) => {
        if (value === undefined || value === null || value === '') return;
        ensureSpace(40);
        pdf.fontSize(8.5).fillColor('#6e6e73').text(`${label}: `, LM, y, { continued: true });
        pdf.fillColor('#1d1d1f').text(String(value));
        y += 12;
      };

      // 1. Identificação do Utente
      sectionTitle('1. IDENTIFICAÇÃO DO UTENTE');
      field('Nº da Ficha', r.file_number != null ? String(r.file_number).padStart(4, '0') : null);
      field('Nome completo', r.customer_name);
      field('Sexo', SEX_LABELS[r.sex] || r.sex);
      field('Idade', calcAge(r.birth_date, d.consultationDate) != null ? `${calcAge(r.birth_date, d.consultationDate)} anos` : null);
      field('Peso', d.weight ? `${d.weight} kg` : null);
      field('Altura', d.height ? `${d.height} m` : null);
      field('Pressão Arterial', d.bloodPressure);
      field('Telefone', r.customer_phone);
      field('Profissão', r.profession);
      field('Objectivo', d.objective);
      y += 6;

      // 2. Queixa Principal e História Relevante
      sectionTitle('2. QUEIXA PRINCIPAL E HISTÓRIA RELEVANTE');
      field('Motivo da consulta / sintomas', d.complaint);
      field('Há quanto tempo', d.symptomsDuration);
      field('Diagnóstico médico conhecido', d.knownDiagnosis);
      field('Medicamentos em uso', d.medicationsInUse);
      field('Alergias conhecidas', r.patient_allergies);
      y += 6;

      // 3. Avaliação Complementar por Biorressonância
      ensureSpace(80);
      sectionTitle('3. AVALIAÇÃO COMPLEMENTAR POR BIORRESSONÂNCIA');
      y = drawRecordTable(pdf, { LM, PW }, y,
        [{ label: 'ÁREA', width: 0.30 }, { label: 'ESTADO', width: 0.20 }, { label: 'OBSERVAÇÃO', width: 0.50 }],
        (d.bioresonance || []).filter(b => b.status || b.observation).map(b => [b.area, BIORESONANCE_STATUS_LABELS[b.status] || '—', b.observation || '—']),
        'Sem avaliação por biorressonância registada.'
      );
      y += 6;

      // 6. Plano de Cuidados
      ensureSpace(60);
      sectionTitle('6. PLANO DE CUIDADOS');
      field('Meta de Hidratação', d.hydrationGoal);
      field('Orientação Alimentar Individual', d.dietaryGuidance);
      y += 6;

      // 7. Suplementação Complementar
      ensureSpace(80);
      sectionTitle('7. SUPLEMENTAÇÃO COMPLEMENTAR');
      y = drawRecordTable(pdf, { LM, PW }, y,
        [{ label: 'PRODUTO', width: 0.30 }, { label: 'OBJECTIVO', width: 0.25 }, { label: 'ORIENTAÇÃO', width: 0.25 }, { label: 'DURAÇÃO', width: 0.20 }],
        (d.recommendedProducts || []).map(p => [
          (p.productId ? productNames[p.productId] : p.customName) || '—', p.objective || '—', p.guidance || '—', p.duration || '—'
        ]),
        'Nenhum produto recomendado.'
      );
      y += 6;

      // 8. Plantas e Chás
      ensureSpace(80);
      sectionTitle('8. PLANTAS E CHÁS');
      y = drawRecordTable(pdf, { LM, PW }, y,
        [{ label: 'PLANTA / CHÁ', width: 0.30 }, { label: 'OBJECTIVO', width: 0.25 }, { label: 'ORIENTAÇÃO', width: 0.25 }, { label: 'PERÍODO', width: 0.20 }],
        (d.herbalTeas || []).map(h => [h.plant || '—', h.objective || '—', h.guidance || '—', h.period || '—']),
        'Nenhuma planta/chá recomendado.'
      );
      y += 6;

      // 9. Encaminhamento
      ensureSpace(60);
      sectionTitle('9. ENCAMINHAMENTO');
      field('Encaminhar para', d.referral === 'Outro' ? d.referralOther : d.referral);
      field('Motivo do encaminhamento', d.referralReason);
      field('Exames/avaliações a discutir', d.examsToDiscuss);
      y += 6;

      // 11. Conclusão e Orientações Prioritárias
      if ((d.priorityGuidelines || []).length) {
        ensureSpace(60);
        sectionTitle('11. CONCLUSÃO E ORIENTAÇÕES PRIORITÁRIAS');
        d.priorityGuidelines.forEach((g, i) => { field(`${i + 1}`, g); });
        y += 6;
      }

      // 12. Termo de Ciência
      ensureSpace(60);
      sectionTitle('12. TERMO DE CIÊNCIA');
      field('Consentimento do utente', d.consentGiven ? 'Declarado' : 'Não registado');
      field('Data (utente)', d.consentDate ? new Date(d.consentDate).toLocaleDateString('pt-MZ') : null);
      field('Profissional responsável', d.professionalName);
      field('Data (profissional)', d.professionalDate ? new Date(d.professionalDate).toLocaleDateString('pt-MZ') : null);
      y += 6;

      if (d.summary) { sectionTitle('NOTAS ADICIONAIS'); pdf.fontSize(8.5).fillColor('#1d1d1f').text(d.summary, LM, y, { width: PW }); y += 20; }

      // Documentos anexados — imagens embutidas na própria ficha; PDFs apenas listados
      // (o pdfkit não faz merge de páginas de outro PDF sem uma dependência extra)
      if (attachments.length) {
        pdf.addPage();
        y = 50;
        pdf.fontSize(12).fillColor('#1d1d1f').font('Helvetica-Bold').text('DOCUMENTOS ANEXADOS', LM, y);
        pdf.font('Helvetica');
        y += 24;
        attachments.forEach((att, i) => {
          if (y > pdf.page.height - 100) { pdf.addPage(); y = 50; }
          const isImage = (att.mimetype || '').startsWith('image/');
          pdf.fontSize(9).fillColor('#1d1d1f').text(`${att.name} (${isImage ? 'imagem' : 'PDF'})`, LM, y);
          y += 14;
          if (isImage && attachmentBuffers[i]) {
            try {
              pdf.image(attachmentBuffers[i], LM, y, { fit: [PW, 260] });
              y += 270;
            } catch {
              pdf.fontSize(8).fillColor('#6e6e73').text('(não foi possível apresentar a pré-visualização)', LM, y);
              y += 16;
            }
          } else {
            pdf.fontSize(8).fillColor('#6e6e73').text('Documento disponível no sistema (secção Documentos do registo clínico).', LM, y);
            y += 16;
          }
          y += 10;
        });
      }

      pdf.end();
    });

    const buf = Buffer.concat(chunks);
    const safeName = (r.customer_name || 'paciente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
    send(res, buf, `ficha-${safeName}-${(d.consultationDate || r.created_at).toString().slice(0, 10)}.pdf`);
  } catch (err) { console.error('[PDF/clinic-record]', err); res.status(500).json({ error: err.message }); }
});

// ── Relatório de Metas & Bónus (staff interno) ────────────────────────────────

// GET /api/pdf/incentives-report?from=&to=
router.get('/incentives-report', authMiddleware, requirePermission('hr.view'), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios' });

    const report = await computeBonusReport(from, to);
    const tax = await getTax();
    const logoBuf = await loadLogoBuffer(tax.logoUrl);

    const { default: PDFDocument } = await import('pdfkit');
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    pdf.on('data', c => chunks.push(c));

    await new Promise((ok, err) => {
      pdf.on('end', ok);
      pdf.on('error', err);

      const PW = pdf.page.width - 100;
      const LM = 50;
      const ensureSpace = (needed) => { if (y > pdf.page.height - needed) { pdf.addPage(); y = 50; } };

      const headerBottom = drawBrandHeader(pdf, tax, logoBuf, { LM });
      pdf.fontSize(16).fillColor('#1d1d1f').text('RELATÓRIO DE METAS & BÓNUS', LM, 50, { align: 'right', width: PW });
      pdf.fontSize(9).fillColor('#6e6e73').text(
        `${new Date(report.from).toLocaleDateString('pt-MZ')} — ${new Date(report.to).toLocaleDateString('pt-MZ')}`,
        LM, 72, { align: 'right', width: PW }
      );
      const dividerY = Math.max(115, headerBottom + 6);
      pdf.moveTo(LM, dividerY).lineTo(LM + PW, dividerY).strokeColor('#d2d2d7').lineWidth(1).stroke();

      let y = dividerY + 15;

      if (!report.employees.length) {
        pdf.fontSize(9).fillColor('#6e6e73').text('Nenhum funcionário com metas atingidas ou aplicáveis neste período.', LM, y);
        y += 20;
      }

      for (const emp of report.employees) {
        ensureSpace(70);
        pdf.fontSize(10.5).fillColor('#1d1d1f').font('Helvetica-Bold').text(emp.employeeName, LM, y);
        pdf.font('Helvetica');
        if (emp.jobTitle) { pdf.fontSize(8).fillColor('#6e6e73').text(emp.jobTitle, LM, y + 13); }
        pdf.fontSize(10.5).fillColor('#059669').font('Helvetica-Bold')
          .text(`${emp.totalBonus.toFixed(2)} MT`, LM, y, { width: PW, align: 'right' });
        pdf.font('Helvetica');
        y += 26;

        for (const g of emp.goals) {
          const detail = g.type === 'unit_threshold'
            ? `${g.productName || 'Produto'} — ${g.unitsSold} vendidas (a cada ${g.everyNUnits}) = ${g.bonusUnits} bónus`
            : `${g.productName ? g.productName + ' — ' : ''}${g.salesValue.toFixed(2)} / ${g.targetValue.toFixed(2)} MT — ${g.achieved ? 'meta atingida' : 'meta não atingida'}`;
          const textWidth = PW - 130;
          pdf.fontSize(8.5);
          const nameHeight = pdf.heightOfString(g.goalName, { width: textWidth });
          pdf.fontSize(7.5);
          const detailHeight = pdf.heightOfString(detail, { width: textWidth });
          const rowHeight = nameHeight + detailHeight + 12;
          ensureSpace(rowHeight + 20);

          pdf.fontSize(8.5).fillColor('#1d1d1f').text(g.goalName, LM + 10, y, { width: textWidth });
          pdf.fontSize(7.5).fillColor('#6e6e73').text(detail, LM + 10, y + nameHeight + 2, { width: textWidth });
          pdf.fontSize(8.5).fillColor(g.bonusValue > 0 ? '#059669' : '#6e6e73')
            .text(`${g.bonusValue.toFixed(2)} MT`, LM, y, { width: PW - 10, align: 'right' });
          y += rowHeight;
        }

        y += 6;
        pdf.moveTo(LM, y).lineTo(LM + PW, y).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
        y += 10;
      }

      ensureSpace(50);
      pdf.rect(LM, y, PW, 26).fillColor('#f0fdf4').fill();
      pdf.fontSize(9).fillColor('#6e6e73').text('TOTAL GERAL', LM + 10, y + 8);
      pdf.fontSize(11).fillColor('#059669').font('Helvetica-Bold')
        .text(`${report.grandTotal.toFixed(2)} MT`, LM, y + 6, { width: PW - 10, align: 'right' });
      pdf.font('Helvetica');
      y += 36;

      const FY = pdf.page.height - 48;
      pdf.moveTo(LM, FY).lineTo(LM + PW, FY).strokeColor('#d2d2d7').lineWidth(0.5).stroke();
      pdf.fontSize(6.5).fillColor('#6e6e73')
        .text(`Gerado em ${new Date().toLocaleString('pt-MZ')}${tax.companyName ? ` · ${tax.companyName}` : ''}`, LM, FY + 8, { align: 'center', width: PW });

      pdf.end();
    });

    const buf = Buffer.concat(chunks);
    send(res, buf, `metas-bonus-${from}-a-${to}.pdf`);
  } catch (err) { console.error('[PDF/incentives-report]', err); res.status(500).json({ error: err.message }); }
});

export default router;
