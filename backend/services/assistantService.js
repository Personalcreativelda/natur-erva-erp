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
];

async function getStockLevel({ productName }) {
  const { rows } = await pool.query(
    `SELECT name, stock, min_stock FROM products WHERE name ILIKE $1 ORDER BY name LIMIT 5`,
    [`%${productName}%`]
  );
  if (!rows.length) return { found: false, message: `Nenhum produto encontrado com o nome "${productName}".` };
  return {
    found: true,
    products: rows.map(r => ({ name: r.name, stock: Number(r.stock), minStock: r.min_stock != null ? Number(r.min_stock) : null })),
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

const SYSTEM_PROMPT = `Você é o assistente interno de gestão de uma loja/ecommerce, acessível apenas por WhatsApp a números autorizados pelo administrador. Responde sempre em português, de forma curta e direta — isto é uma conversa de WhatsApp, não um relatório formal. Usa sempre as ferramentas disponíveis para consultar dados reais do sistema; nunca inventes números ou estados de encomendas. Nesta fase só podes consultar informação (stock, vendas, encomendas) — não tens capacidade de alterar nada no sistema. Se te pedirem para executar uma ação (criar, editar, apagar, processar algo), explica claramente que ainda não tens essa capacidade.`;

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
