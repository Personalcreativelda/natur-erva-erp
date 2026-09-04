import pool from '../db.js';

// ─── Ferramentas (só leitura, Fase 1) ────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_stock_level',
    description: 'Devolve o stock atual de um ou mais produtos que correspondam ao nome pesquisado (pesquisa parcial).',
    parameters: {
      type: 'object',
      properties: { productName: { type: 'string', description: 'Nome ou parte do nome do produto' } },
      required: ['productName'],
    },
  },
  {
    name: 'list_low_stock_products',
    description: 'Lista os produtos cujo stock atual está abaixo do stock mínimo definido.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_sales_summary',
    description: 'Resumo de vendas (total em MT e número de encomendas) para um período.',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'week', 'month'], description: 'today = hoje, week = últimos 7 dias, month = últimos 30 dias' } },
      required: ['period'],
    },
  },
  {
    name: 'get_pending_orders',
    description: 'Lista as encomendas ainda por tratar (pendentes, confirmadas ou em processamento).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_order_status',
    description: 'Devolve o estado atual de uma encomenda específica pelo número.',
    parameters: {
      type: 'object',
      properties: { orderNumber: { type: 'string', description: 'Número da encomenda' } },
      required: ['orderNumber'],
    },
  },
  {
    name: 'get_clinic_summary',
    description: 'Resumo da Clínica: pacientes ativos, consultas agendadas nos próximos 7 dias e planos de tratamento ativos por área.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_hr_summary',
    description: 'Resumo de Recursos Humanos: total de funcionários, ativos, de férias, departamentos e pedidos de férias pendentes.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_pending_purchases',
    description: 'Lista as compras a fornecedores ainda por concluir (pendentes, aprovação, encomendadas ou parcialmente recebidas).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_quotes_summary',
    description: 'Lista as cotações/orçamentos mais recentes, com estado (rascunho, enviada, aceite, convertida, expirada, rejeitada).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_invoices_summary',
    description: 'Resumo de faturas/recibos: total faturado, total pago, faturas vencidas e a lista das que estão pendentes ou vencidas.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_logistics_summary',
    description: 'Lista as encomendas com entrega em curso (confirmadas, em processamento ou a caminho).',
    parameters: { type: 'object', properties: {} },
  },
];

async function getStockLevel({ productName }) {
  const { rows } = await pool.query(
    `SELECT name, category, price, stock, min_stock, unit FROM products WHERE name ILIKE $1 ORDER BY name LIMIT 5`,
    [`%${productName}%`]
  );
  if (!rows.length) return { found: false, message: `Nenhum produto encontrado com o nome "${productName}".` };
  return {
    found: true,
    products: rows.map(r => ({
      name: r.name, category: r.category, price: Number(r.price),
      stock: Number(r.stock), minStock: r.min_stock != null ? Number(r.min_stock) : null, unit: r.unit,
    })),
  };
}

async function getClinicSummary() {
  const [patients, appointments, protocols, byArea] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS count FROM clinic_patients WHERE is_active = true`),
    pool.query(`SELECT COUNT(*) AS count FROM clinic_appointments WHERE scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND status IN ('agendado','confirmado')`),
    pool.query(`SELECT COUNT(*) AS count FROM clinic_protocols WHERE status = 'ativo'`),
    pool.query(`SELECT area, COUNT(*) AS count FROM clinic_protocols WHERE status = 'ativo' GROUP BY area`),
  ]);
  return {
    activePatients: Number(patients.rows[0].count),
    upcomingAppointments7d: Number(appointments.rows[0].count),
    activeTreatmentPlans: Number(protocols.rows[0].count),
    activePlansByArea: byArea.rows.map(r => ({ area: r.area, count: Number(r.count) })),
  };
}

async function getHrSummary() {
  const [total, active, onLeave, departments, pendingLeaves] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM employees`),
    pool.query(`SELECT COUNT(*)::int AS n FROM employees WHERE status = 'active'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM employees WHERE status = 'on_leave'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM departments`),
    pool.query(`SELECT COUNT(*)::int AS n FROM leave_requests WHERE status = 'pending'`),
  ]);
  return {
    totalEmployees: total.rows[0].n,
    activeEmployees: active.rows[0].n,
    onLeaveEmployees: onLeave.rows[0].n,
    departments: departments.rows[0].n,
    pendingLeaveRequests: pendingLeaves.rows[0].n,
  };
}

async function getPendingPurchases() {
  const { rows } = await pool.query(
    `SELECT id, supplier_name, total_amount, status, payment_status, COALESCE(date, order_date, created_at) AS order_date
     FROM purchases
     WHERE status IN ('pending','draft','pending_approval','approved','ordered','partially_received')
     ORDER BY COALESCE(date, order_date, created_at) ASC LIMIT 20`
  );
  return {
    count: rows.length,
    purchases: rows.map(r => ({
      supplierName: r.supplier_name, total: Number(r.total_amount), status: r.status,
      paymentStatus: r.payment_status, orderDate: r.order_date,
    })),
  };
}

async function getQuotesSummary() {
  const { rows } = await pool.query(
    `SELECT quote_number, customer_name, total, status, valid_until, created_at
     FROM quotes ORDER BY created_at DESC LIMIT 20`
  );
  return {
    count: rows.length,
    quotes: rows.map(r => ({
      quoteNumber: r.quote_number, customerName: r.customer_name, total: Number(r.total),
      status: r.status, validUntil: r.valid_until, createdAt: r.created_at,
    })),
  };
}

async function getInvoicesSummary() {
  const { rows: statsRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status != 'cancelled')::int AS total_count,
       COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled'), 0)::numeric AS total_invoiced,
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)::numeric AS total_paid,
       COUNT(*) FILTER (WHERE status = 'overdue' OR (status = 'issued' AND due_date < CURRENT_DATE))::int AS overdue_count,
       COALESCE(SUM(total_amount - amount_paid) FILTER (WHERE status = 'overdue' OR (status = 'issued' AND due_date < CURRENT_DATE)), 0)::numeric AS overdue_amount
     FROM invoices`
  );
  const { rows: pendingRows } = await pool.query(
    `SELECT invoice_number, customer_name, total_amount, status, due_date
     FROM invoices
     WHERE status IN ('issued','partial','overdue')
     ORDER BY due_date ASC NULLS LAST LIMIT 15`
  );
  const s = statsRows[0];
  return {
    totalCount: s.total_count,
    totalInvoiced: Number(s.total_invoiced),
    totalPaid: Number(s.total_paid),
    overdueCount: s.overdue_count,
    overdueAmount: Number(s.overdue_amount),
    pending: pendingRows.map(r => ({
      invoiceNumber: r.invoice_number, customerName: r.customer_name, total: Number(r.total_amount),
      status: r.status, dueDate: r.due_date,
    })),
  };
}

async function getLogisticsSummary() {
  const { rows } = await pool.query(
    `SELECT order_number, tracking_code, status, delivery_zone_name, estimated_delivery_date, created_at
     FROM orders
     WHERE is_delivery = true AND status IN ('confirmed','processing','out_for_delivery')
     ORDER BY created_at ASC LIMIT 20`
  );
  return {
    count: rows.length,
    deliveries: rows.map(r => ({
      orderNumber: r.order_number, trackingCode: r.tracking_code, status: r.status,
      deliveryZone: r.delivery_zone_name, estimatedDelivery: r.estimated_delivery_date, createdAt: r.created_at,
    })),
  };
}

async function listLowStockProducts() {
  const { rows } = await pool.query(
    `SELECT name, stock, min_stock FROM products
     WHERE min_stock > 0 AND stock < min_stock
     ORDER BY (stock::float / NULLIF(min_stock, 0)) ASC LIMIT 30`
  );
  return { count: rows.length, products: rows.map(r => ({ name: r.name, stock: Number(r.stock), minStock: Number(r.min_stock) })) };
}

const SALES_PERIOD_SQL = {
  today: 'CURRENT_DATE',
  week: "CURRENT_DATE - INTERVAL '7 days'",
  month: "CURRENT_DATE - INTERVAL '30 days'",
};

async function getSalesSummary({ period }) {
  const since = SALES_PERIOD_SQL[period] || SALES_PERIOD_SQL.today;
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS orders_count, COALESCE(SUM(total_amount), 0) AS total
     FROM orders WHERE created_at >= ${since} AND status NOT IN ('cancelled')`
  );
  return { period, ordersCount: parseInt(rows[0].orders_count, 10), total: Number(rows[0].total) };
}

async function getPendingOrders() {
  const { rows } = await pool.query(
    `SELECT order_number, customer_name, total_amount, status, created_at
     FROM orders WHERE status IN ('pending', 'confirmed', 'processing')
     ORDER BY created_at ASC LIMIT 20`
  );
  return {
    count: rows.length,
    orders: rows.map(r => ({ orderNumber: r.order_number, customerName: r.customer_name, total: Number(r.total_amount), status: r.status, createdAt: r.created_at })),
  };
}

async function getOrderStatus({ orderNumber }) {
  const { rows } = await pool.query(
    `SELECT order_number, customer_name, status, total_amount, created_at, delivered_at
     FROM orders WHERE order_number = $1 LIMIT 1`,
    [orderNumber]
  );
  if (!rows.length) return { found: false, message: `Encomenda ${orderNumber} não encontrada.` };
  const o = rows[0];
  return {
    found: true, orderNumber: o.order_number, customerName: o.customer_name, status: o.status,
    total: Number(o.total_amount), createdAt: o.created_at, deliveredAt: o.delivered_at,
  };
}

const TOOL_IMPLS = {
  get_stock_level: getStockLevel,
  list_low_stock_products: listLowStockProducts,
  get_sales_summary: getSalesSummary,
  get_pending_orders: getPendingOrders,
  get_order_status: getOrderStatus,
  get_clinic_summary: getClinicSummary,
  get_hr_summary: getHrSummary,
  get_pending_purchases: getPendingPurchases,
  get_quotes_summary: getQuotesSummary,
  get_invoices_summary: getInvoicesSummary,
  get_logistics_summary: getLogisticsSummary,
};

async function runTool(name, args) {
  const impl = TOOL_IMPLS[name];
  if (!impl) return { error: `Ferramenta desconhecida: ${name}` };
  try { return await impl(args || {}); }
  catch (err) { console.error(`[assistant tool ${name}]`, err); return { error: 'Erro ao executar a consulta.' }; }
}

// ─── LLM — OpenAI ─────────────────────────────────────────────────────────────

async function callOpenAI({ apiKey, model, messages }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      tools: TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

async function runOpenAILoop({ apiKey, model, systemPrompt, history, userMessage }) {
  const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }];
  for (let step = 0; step < 5; step++) {
    const data = await callOpenAI({ apiKey, model, messages });
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Resposta inválida da OpenAI');
    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* args inválidos, usa {} */ }
        const result = await runTool(call.function.name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    return msg.content || 'Não consegui gerar uma resposta.';
  }
  return 'Desculpe, não consegui concluir o pedido.';
}

// ─── LLM — Anthropic ──────────────────────────────────────────────────────────

async function callAnthropic({ apiKey, model, systemPrompt, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

async function runAnthropicLoop({ apiKey, model, systemPrompt, history, userMessage }) {
  const messages = [...history, { role: 'user', content: userMessage }];
  for (let step = 0; step < 5; step++) {
    const data = await callAnthropic({ apiKey, model, systemPrompt, messages });
    const toolUses = (data.content || []).filter(b => b.type === 'tool_use');
    if (data.stop_reason === 'tool_use' && toolUses.length) {
      messages.push({ role: 'assistant', content: data.content });
      const toolResults = [];
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input);
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return textBlock?.text || 'Não consegui gerar uma resposta.';
  }
  return 'Desculpe, não consegui concluir o pedido.';
}

// ─── LLM — Google Gemini ──────────────────────────────────────────────────────

async function callGemini({ apiKey, model, systemPrompt, contents }) {
  const mdl = model || 'gemini-3.6-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

async function runGeminiLoop({ apiKey, model, systemPrompt, history, userMessage }) {
  // A Gemini usa 'model' em vez de 'assistant' para o papel da IA
  const contents = [
    ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];
  for (let step = 0; step < 5; step++) {
    const data = await callGemini({ apiKey, model, systemPrompt, contents });
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter(p => p.functionCall);
    if (functionCalls.length) {
      contents.push({ role: 'model', parts });
      const responseParts = [];
      for (const fc of functionCalls) {
        const result = await runTool(fc.functionCall.name, fc.functionCall.args || {});
        responseParts.push({ functionResponse: { name: fc.functionCall.name, response: result } });
      }
      contents.push({ role: 'user', parts: responseParts });
      continue;
    }
    const textPart = parts.find(p => p.text);
    return textPart?.text || 'Não consegui gerar uma resposta.';
  }
  return 'Desculpe, não consegui concluir o pedido.';
}

async function runAssistantTurn({ provider, apiKey, model, systemPrompt, history, userMessage }) {
  if (provider === 'openai') return runOpenAILoop({ apiKey, model, systemPrompt, history, userMessage });
  if (provider === 'gemini') return runGeminiLoop({ apiKey, model, systemPrompt, history, userMessage });
  return runAnthropicLoop({ apiKey, model, systemPrompt, history, userMessage });
}

// ─── Evolution API ────────────────────────────────────────────────────────────

export async function sendEvolutionMessage(config, phone, text) {
  const baseUrl = (config.evolution_base_url || config.evolutionBaseUrl || '').replace(/\/$/, '');
  const instance = config.evolution_instance || config.evolutionInstance;
  const apiKey = config.evolution_api_key || config.evolutionApiKey;
  if (!baseUrl || !instance || !apiKey) throw new Error('Configuração da Evolution API incompleta');

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) throw new Error(`Evolution API: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json().catch(() => ({}));
}

// ─── Orquestração ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o assistente interno de gestão da Natur Erva (loja/ecommerce), acessível apenas por WhatsApp a números autorizados pelo administrador. Responde sempre em português, de forma curta e direta — isto é uma conversa de WhatsApp, não um relatório formal. Usa sempre as ferramentas disponíveis para consultar dados reais do sistema; nunca inventes números ou estados.

Podes consultar: Stock e informação de produtos, resumo de Vendas, Encomendas (pendentes ou por número), Clínica (pacientes e planos de tratamento ativos), Recursos Humanos (funcionários e pedidos de férias), Compras (encomendas a fornecedores), Cotações, Faturas/Recibos (pagas, pendentes, vencidas) e Logística (entregas em curso).

Nesta fase só podes consultar informação — não tens capacidade de criar, editar ou apagar nada no sistema. Se te pedirem para executar uma ação, explica claramente que ainda não tens essa capacidade.`;

export async function handleIncomingMessage(config, phone, text) {
  const { rows: historyRows } = await pool.query(
    `SELECT role, content FROM assistant_messages WHERE phone = $1 ORDER BY created_at DESC LIMIT 6`,
    [phone]
  );
  const history = historyRows.reverse().map(r => ({ role: r.role, content: r.content }));

  const reply = await runAssistantTurn({
    provider: config.llm_provider,
    apiKey: config.llm_api_key,
    model: config.llm_model,
    systemPrompt: SYSTEM_PROMPT,
    history,
    userMessage: text,
  });

  await pool.query(
    `INSERT INTO assistant_messages (phone, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
    [phone, text, reply]
  );

  await sendEvolutionMessage(config, phone, reply);
  return reply;
}

export { listLowStockProducts, runTool };
