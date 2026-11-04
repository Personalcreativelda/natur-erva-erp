import express from 'express';
import pool from '../db.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { sendOrderConfirmationEmail, sendOrderStatusEmail, sendWhatsAppMessage } from '../services/emailService.js';
import { awardOrderPoints } from '../services/loyaltyService.js';

const router = express.Router();

// Garantir que phone tem espaço suficiente para placeholder e números internacionais
pool.query(`ALTER TABLE customers ALTER COLUMN phone TYPE VARCHAR(50)`).catch(() => {});

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Staff (POS, pedidos manuais) pode definir preços; clientes da loja não. */
const isStaffRequest = (user) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const roles = Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role];
  return roles.some(r => r && String(r).toUpperCase() !== 'CLIENTE');
};

class PricingError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/**
 * Recalcula no servidor preços, entrega e desconto de um pedido feito por um cliente.
 * Nunca confia nos valores enviados pelo browser (antes era possível criar um pedido de 1 MT).
 * Regra de promoção = a mesma do front (front/modules/shop/utils/pricing.ts):
 *   promoção activa dentro das datas e menor que o preço base da variante/produto.
 */
async function repriceCustomerOrder(client, order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) throw new PricingError('O pedido não tem artigos.');

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (items.some(i => !UUID_RE.test(String(i.productId || '')) || (i.variantId && !UUID_RE.test(String(i.variantId))))) {
    throw new PricingError('Artigo inválido no pedido.');
  }
  if (order.isDelivery && order.deliveryZoneId && !UUID_RE.test(String(order.deliveryZoneId))) {
    throw new PricingError('Zona de entrega inválida.');
  }
  const productIds = [...new Set(items.map(i => i.productId))];

  const { rows: products } = await client.query(
    `SELECT id, name, price, show_in_shop,
            CASE WHEN promotional_price > 0
                  AND (promotional_price_start IS NULL OR promotional_price_start <= CURRENT_DATE)
                  AND (promotional_price_end   IS NULL OR promotional_price_end   >= CURRENT_DATE)
                 THEN promotional_price END AS active_promo
       FROM products WHERE id = ANY($1::uuid[])`,
    [productIds]
  );
  const { rows: variants } = await client.query(
    'SELECT id, product_id, name, price FROM product_variants WHERE product_id = ANY($1::uuid[])',
    [productIds]
  );
  const productMap = new Map(products.map(p => [p.id, p]));

  const repriced = items.map(item => {
    const product = productMap.get(item.productId);
    if (!product) throw new PricingError(`Produto "${item.productName || ''}" já não está disponível.`);
    if (product.show_in_shop === false) throw new PricingError(`Produto "${product.name}" não está à venda na loja.`);

    const qty = Math.floor(Number(item.quantity));
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) throw new PricingError(`Quantidade inválida para "${product.name}".`);

    let base = Number(product.price) || 0;
    if (item.variantId) {
      const variant = variants.find(v => v.id === item.variantId && v.product_id === product.id);
      if (!variant) throw new PricingError(`A opção escolhida de "${product.name}" já não existe.`);
      base = Number(variant.price ?? product.price) || 0;
    }
    const promo = product.active_promo != null ? Number(product.active_promo) : null;
    const unitPrice = round2(promo != null && promo < base ? promo : base);

    return { ...item, quantity: qty, price: unitPrice, priceAtTime: unitPrice };
  });

  const subtotal = round2(repriced.reduce((s, i) => s + i.price * i.quantity, 0));

  // Taxa de entrega vem da zona, não do browser
  let deliveryFee = 0;
  let deliveryZoneName = order.deliveryZoneName || null;
  if (order.isDelivery) {
    if (!order.deliveryZoneId) throw new PricingError('Selecione a zona de entrega.');
    const { rows: zones } = await client.query(
      'SELECT name, price FROM delivery_zones WHERE id = $1 AND is_active IS NOT FALSE',
      [order.deliveryZoneId]
    );
    if (!zones.length) throw new PricingError('A zona de entrega selecionada não está disponível.');
    deliveryFee = round2(zones[0].price);
    deliveryZoneName = zones[0].name;
  }

  // Desconto do cupão recalculado (mesma lógica de POST /coupons/validate)
  let discountAmount = 0;
  if (order.couponCode) {
    const { rows: couponRows } = await client.query(
      'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = TRUE LIMIT 1',
      [order.couponCode]
    );
    const c = couponRows[0];
    const now = new Date();
    const valid = c
      && (!c.valid_from || new Date(c.valid_from) <= now)
      && (!c.valid_until || new Date(c.valid_until) >= now)
      && (c.max_uses === null || c.current_uses < c.max_uses)
      && subtotal >= (Number(c.min_order_amount) || 0);
    if (valid) {
      if (c.type === 'percentage') {
        discountAmount = (subtotal * Number(c.value)) / 100;
        if (c.max_discount_amount) discountAmount = Math.min(discountAmount, Number(c.max_discount_amount));
      } else if (c.type === 'free_shipping') {
        discountAmount = deliveryFee;
      }
    }
    discountAmount = round2(Math.min(discountAmount, subtotal + deliveryFee));
  }

  return {
    ...order,
    items: repriced,
    deliveryFee,
    deliveryZoneName,
    discountAmount,
    couponCode: discountAmount > 0 ? order.couponCode : null,
    totalAmount: round2(Math.max(0, subtotal + deliveryFee - discountAmount)),
    // Campos que um cliente não pode definir
    status: 'pending',
    source: order.source === 'pos' ? 'Direct' : (order.source || 'Direct'), // 'pos' marcaria o pedido como pago
    paymentStatus: undefined,
    amountPaid: 0,
    estimatedDeliveryDate: undefined,
  };
}

const mapOrder = (row) => ({
  id: row.id,
  externalId: row.external_id,
  orderNumber: row.order_number,
  trackingCode: row.tracking_code || null,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  items: row.items || [],
  totalAmount: Number(row.total_amount) || 0,
  status: row.status,
  source: row.source,
  isDelivery: !!row.is_delivery,
  deliveryLocation: row.delivery_location,
  deliveryFee: Number(row.delivery_fee) || 0,
  paymentStatus: row.payment_status || 'unpaid',
  paymentMethod: row.payment_method || null,
  amountPaid: Number(row.amount_paid) || 0,
  paymentProof: row.payment_proof,
  paymentProofText: row.payment_proof_text,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  createdByName: row.creator_name || undefined,
  deliveryZoneId: row.delivery_zone_id,
  deliveryZoneName: row.delivery_zone_name,
  deliveryLatitude: row.delivery_latitude,
  deliveryLongitude: row.delivery_longitude,
  deliveryAddressFormatted: row.delivery_address_formatted,
  couponCode: row.coupon_code,
  discountAmount: Number(row.discount_amount) || 0,
  estimatedDeliveryDate: row.estimated_delivery_date || null,
  disputeDeadline: row.dispute_deadline || null,
  deliveredAt: row.delivered_at || null,
});

const generateTrackingCode = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `NE-${date}-${suffix}`;
};

// GET /api/orders
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, p.name as creator_name 
       FROM orders o 
       LEFT JOIN profiles p ON p.id = o.created_by
       ORDER BY o.created_at DESC`
    );
    res.json(rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders]', err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// GET /api/orders/count
router.get('/count', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM orders');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    console.error('[GET /orders/count]', err);
    res.status(500).json({ error: 'Erro ao contar pedidos' });
  }
});

// GET /api/orders/next-number
router.get('/next-number', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 100'
    );
    let max = 0;
    for (const row of rows) {
      const num = parseInt((row.order_number || '').replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    res.json({ nextNumber: String(max + 1) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar número' });
  }
});

// GET /api/orders/check-number/:number
router.get('/check-number/:number', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id FROM orders WHERE order_number = $1 LIMIT 1',
      [req.params.number]
    );
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar número' });
  }
});

// GET /api/orders/my-orders — encomendas do cliente autenticado
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT o.*
       FROM orders o
       JOIN profiles p ON p.id = $1
       WHERE o.customer_id = p.customer_id OR o.created_by = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json(rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders/my-orders]', err);
    res.status(500).json({ error: 'Erro ao buscar encomendas' });
  }
});

// GET /api/orders/my-orders/:id — detalhe de 1 encomenda do cliente
router.get('/my-orders/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT o.*
       FROM orders o
       JOIN profiles p ON p.id = $1
       WHERE o.id = $2 AND (o.customer_id = p.customer_id OR o.created_by = $1)`,
      [userId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(mapOrder(rows[0]));
  } catch (err) {
    console.error('[GET /orders/my-orders/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// PUT /api/orders/my-orders/:id/confirm — cliente confirma receção
router.put('/my-orders/:id/confirm', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, status FROM orders
       WHERE id = $1 AND (created_by = $2 OR customer_id IN (SELECT customer_id FROM profiles WHERE id = $2))`,
      [req.params.id, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (rows[0].status !== 'delivered') return res.status(400).json({ error: 'Só é possível confirmar encomendas no estado "Entregue".' });

    await pool.query(
      `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    // Atribuir pontos de fidelidade ao confirmar receção
    awardOrderPoints(req.params.id).catch(pErr =>
      console.warn('[Orders] loyalty award on confirm error:', pErr.message)
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /orders/my-orders/:id/confirm]', err);
    res.status(500).json({ error: 'Erro ao confirmar receção' });
  }
});

// GET /api/orders/tracking/:code — público, sem autenticação
router.get('/tracking/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT order_number, tracking_code, status, created_at, updated_at, delivered_at,
              delivery_zone_name, is_delivery, customer_name,
              estimated_delivery_date, dispute_deadline
       FROM orders WHERE UPPER(tracking_code) = UPPER($1)`,
      [req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    const o = rows[0];
    res.json({
      trackingCode:          o.tracking_code,
      orderNumber:           o.order_number,
      status:                o.status,
      customerName:          o.customer_name,
      createdAt:             o.created_at,
      updatedAt:             o.updated_at,
      deliveredAt:           o.delivered_at || null,
      deliveryZoneName:      o.delivery_zone_name,
      isDelivery:            o.is_delivery,
      estimatedDeliveryDate: o.estimated_delivery_date || null,
      disputeDeadline:       o.dispute_deadline || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao rastrear pedido' });
  }
});

// GET /api/orders/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT o.*, p.name as creator_name FROM orders o LEFT JOIN profiles p ON p.id = o.created_by WHERE o.id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(mapOrder(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// POST /api/orders
router.post('/', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const isStaff = isStaffRequest(req.user);
    let order = req.body;
    if (!isStaff) {
      try {
        order = await repriceCustomerOrder(client, req.body);
      } catch (err) {
        if (err instanceof PricingError) {
          await client.query('ROLLBACK');
          return res.status(err.status).json({ error: err.message });
        }
        throw err;
      }
      // Um cliente só pode criar pedidos em seu próprio nome (afiliados/emails usam createdBy)
      order.createdBy = req.user?.id || null;
    }

    const rawPhone = order.customerPhone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const hasPhone = cleanPhone.length > 5;
    const phoneToSave = hasPhone ? cleanPhone : `np_${Date.now().toString(36)}`; // max ~14 chars, dentro do varchar(20)

    // Encontrar ou criar cliente
    let customerId = order.customerId;
    let customerCreated = false;
    let customerUpdated = false;

    if (hasPhone) {
      const { rows: existing } = await client.query(
        'SELECT id, total_orders, total_spent, last_order_date FROM customers WHERE phone = $1 LIMIT 1',
        [cleanPhone]
      );
      if (existing.length) {
        customerId = existing[0].id;
        customerUpdated = true;
        const newOrders = Number(existing[0].total_orders || 0) + 1;
        const newSpent = Number(existing[0].total_spent || 0) + Number(order.totalAmount);
        const tier = newOrders > 15 || newSpent > 20000 ? 'GOLD' : newOrders > 5 || newSpent > 5000 ? 'SILVER' : 'BRONZE';
        await client.query(
          'UPDATE customers SET total_orders = $1, total_spent = $2, tier = $3, last_order_date = $4 WHERE id = $5',
          [newOrders, newSpent, tier, order.createdAt || new Date().toISOString(), customerId]
        );
      }
    }

    if (!customerId && order.customerName) {
      const { rows: byName } = await client.query(
        'SELECT id FROM customers WHERE name = $1 LIMIT 1',
        [order.customerName]
      );
      if (byName.length) customerId = byName[0].id;
    }

    if (!customerId) {
      customerCreated = true;
      const { rows: newCust } = await client.query(
        `INSERT INTO customers (name, phone, total_orders, total_spent, tier, last_order_date, address)
         VALUES ($1, $2, 1, $3, 'BRONZE', $4, $5) RETURNING id`,
        [order.customerName, phoneToSave, order.totalAmount,
         order.createdAt || new Date().toISOString(), order.deliveryLocation || null]
      );
      customerId = newCust[0].id;
    }

    // Gerar número de pedido se não tiver
    let orderNumber = order.orderNumber;
    if (!orderNumber?.trim()) {
      const { rows: nums } = await client.query('SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 100');
      let max = 0;
      for (const r of nums) {
        const n = parseInt((r.order_number || '').replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > max) max = n;
      }
      orderNumber = String(max + 1);
    }

    // Validar stock disponível para cada item
    for (const item of (order.items || [])) {
      if (!item.productId) continue;
      const qty = Number(item.quantity) || 1;
      if (item.variantId) {
        const { rows: vRows } = await client.query(
          'SELECT stock FROM product_variants WHERE id = $1', [item.variantId]
        );
        if (vRows.length && Number(vRows[0].stock) < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Produto "${item.productName || 'desconhecido'}" sem stock suficiente. Disponível: ${vRows[0].stock}`
          });
        }
      } else {
        const { rows: pRows } = await client.query(
          'SELECT stock FROM products WHERE id = $1', [item.productId]
        );
        if (pRows.length && Number(pRows[0].stock) < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Produto "${item.productName || 'desconhecido'}" sem stock suficiente. Disponível: ${pRows[0].stock}`
          });
        }
      }
    }

    // Validar e aplicar cupão se fornecido
    let couponCode = order.couponCode || null;
    let discountAmount = order.discountAmount || 0;
    if (couponCode) {
      const { rows: couponRows } = await client.query(
        'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = TRUE LIMIT 1',
        [couponCode]
      );
      if (couponRows.length) {
        const coupon = couponRows[0];
        const now = new Date();
        const valid = (!coupon.valid_from || new Date(coupon.valid_from) <= now)
                   && (!coupon.valid_until || new Date(coupon.valid_until) >= now)
                   && (coupon.max_uses === null || coupon.current_uses < coupon.max_uses);
        if (valid) {
          couponCode = coupon.code;
          await client.query(
            'UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1',
            [coupon.id]
          );
        } else {
          couponCode = null;
          discountAmount = 0;
        }
      } else {
        couponCode = null;
        discountAmount = 0;
      }
    }

    const trackingCode = generateTrackingCode();

    // Pedidos do POS são sempre pagos imediatamente
    const resolvedPaymentStatus = order.source === 'pos' ? 'paid' : (order.paymentStatus || 'unpaid');

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
        external_id, order_number, tracking_code, customer_id, customer_name, customer_phone,
        items, total_amount, status, source, is_delivery, delivery_location,
        delivery_fee, payment_status, payment_method, amount_paid, payment_proof, payment_proof_text,
        notes, created_at, created_by, delivery_zone_id, delivery_zone_name,
        delivery_latitude, delivery_longitude, delivery_address_formatted,
        coupon_code, discount_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      RETURNING *`,
      [
        order.externalId || null, orderNumber, trackingCode, customerId, order.customerName,
        hasPhone ? cleanPhone : '', JSON.stringify(order.items || []),
        order.totalAmount, order.status, order.source || null,
        order.isDelivery || false, order.deliveryLocation || null,
        order.deliveryFee || 0, resolvedPaymentStatus,
        order.paymentMethod || null,
        order.amountPaid || 0, order.paymentProof || null,
        order.paymentProofText || null, order.notes || null,
        order.createdAt || new Date().toISOString(),
        order.createdBy || req.user?.id || null,
        order.deliveryZoneId || null, order.deliveryZoneName || null,
        order.deliveryLatitude || null, order.deliveryLongitude || null,
        order.deliveryAddressFormatted || null,
        couponCode, discountAmount
      ]
    );

    // Deduzir stock após criação da ordem
    for (const item of (order.items || [])) {
      if (!item.productId) continue;
      const qty = Number(item.quantity) || 1;
      if (item.variantId) {
        await client.query(
          'UPDATE product_variants SET stock = GREATEST(0, stock - $1) WHERE id = $2',
          [qty, item.variantId]
        ).catch(() => {});
        // Sincronizar stock do produto pai (soma das variantes)
        await client.query(
          `UPDATE products SET stock = (
            SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = products.id
          ) WHERE id = $1`,
          [item.productId]
        ).catch(() => {});
      } else {
        await client.query(
          'UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2',
          [qty, item.productId]
        ).catch(() => {});
      }
    }

    await client.query('COMMIT');

    // Auto-definir data estimada de entrega se não fornecida.
    // Feito DEPOIS do COMMIT: antes, corria com `pool` (outra ligação) enquanto a transacção
    // estava aberta, a linha ainda não era visível e o UPDATE nunca tinha efeito.
    if (!order.estimatedDeliveryDate) {
      const deliveryDays = order.isDelivery ? 3 : 1; // 3 dias para entrega, 1 dia para levantamento
      await pool.query(
        `UPDATE orders SET estimated_delivery_date = CURRENT_DATE + ($1::int * INTERVAL '1 day') WHERE id = $2`,
        [deliveryDays, orderRows[0].id]
      ).catch(() => {});
    }

    // Gerar comissão de afiliado (best-effort — não bloqueia o pedido)
    try {
      const buyerId = order.createdBy || req.user?.id;
      if (buyerId) {
        const { rows: refRows } = await pool.query(
          'SELECT referred_by_code FROM profiles WHERE id = $1', [buyerId]
        );
        const refCode = refRows[0]?.referred_by_code;
        if (refCode) {
          const { rows: affRows } = await pool.query(
            "SELECT id, commission_rate FROM affiliates WHERE referral_code = $1 AND status = 'active'",
            [refCode]
          );
          if (affRows.length) {
            const { id: affiliateId, commission_rate } = affRows[0];
            const commAmt = (Number(order.totalAmount) * Number(commission_rate) / 100).toFixed(2);
            await pool.query(
              `INSERT INTO affiliate_commissions
               (affiliate_id, order_id, referred_profile_id, order_amount, commission_rate, commission_amount)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [affiliateId, orderRows[0].id, buyerId, order.totalAmount, commission_rate, commAmt]
            );
            await pool.query(
              'UPDATE affiliates SET pending_balance = pending_balance + $1, updated_at = NOW() WHERE id = $2',
              [commAmt, affiliateId]
            );
          }
        }
      }
    } catch (affErr) {
      console.warn('[Orders] affiliate commission error:', affErr.message);
    }

    // Email de confirmação de pedido (best-effort)
    try {
      const buyerId = order.createdBy || req.user?.id;
      if (buyerId) {
        const { rows: pRows } = await pool.query('SELECT email, name FROM profiles WHERE id = $1', [buyerId]);
        if (pRows.length && pRows[0].email) {
          sendOrderConfirmationEmail({
            to: pRows[0].email,
            name: pRows[0].name,
            orderNumber: orderRows[0].order_number,
            items: order.items || [],
            totalAmount: order.totalAmount,
            isDelivery: order.isDelivery,
            deliveryLocation: order.deliveryLocation
          }).catch(() => {});
        }
      }
    } catch {}

    res.status(201).json({
      order: mapOrder(orderRows[0]),
      customerCreated,
      customerUpdated
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /orders]', err);
    res.status(500).json({ error: 'Erro ao criar pedido: ' + err.message });
  } finally {
    client.release();
  }
});

// PUT /api/orders/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    const fieldMap = {
      status: 'status', totalAmount: 'total_amount', items: 'items',
      createdAt: 'created_at', customerName: 'customer_name',
      customerPhone: 'customer_phone', isDelivery: 'is_delivery',
      deliveryLocation: 'delivery_location', deliveryFee: 'delivery_fee',
      paymentStatus: 'payment_status', amountPaid: 'amount_paid',
      paymentProof: 'payment_proof', paymentProofText: 'payment_proof_text',
      notes: 'notes', deliveryZoneId: 'delivery_zone_id',
      deliveryZoneName: 'delivery_zone_name', deliveryLatitude: 'delivery_latitude',
      deliveryLongitude: 'delivery_longitude', deliveryAddressFormatted: 'delivery_address_formatted',
      createdBy: 'created_by',
      estimatedDeliveryDate: 'estimated_delivery_date',
      paymentMethod: 'payment_method',
      paymentStatus: 'payment_status',
    };

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (updates[jsKey] !== undefined) {
        fields.push(`${dbKey} = $${i++}`);
        values.push(jsKey === 'items' ? JSON.stringify(updates[jsKey]) : updates[jsKey]);
      }
    }

    if (fields.length === 0) return res.json({ success: true });

    // Ao marcar como entregue: registar delivered_at e calcular dispute_deadline (15 dias)
    if (updates.status === 'delivered') {
      fields.push(`delivered_at = NOW()`);
      fields.push(`dispute_deadline = (CURRENT_DATE + INTERVAL '15 days')`);
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(`UPDATE orders SET ${fields.join(', ')} WHERE id = $${i}`, values);

    // Devolver stock quando cancelado
    if (updates.status === 'cancelled') {
      const { rows: oRows } = await pool.query('SELECT items FROM orders WHERE id = $1', [req.params.id]);
      if (oRows.length) {
        const items = Array.isArray(oRows[0].items) ? oRows[0].items : JSON.parse(oRows[0].items || '[]');
        for (const item of items) {
          if (!item.productId) continue;
          const qty = Number(item.quantity) || 1;
          if (item.variantId) {
            await pool.query(
              'UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [qty, item.variantId]
            ).catch(() => {});
            await pool.query(
              `UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=products.id) WHERE id=$1`,
              [item.productId]
            ).catch(() => {});
          } else {
            await pool.query(
              'UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, item.productId]
            ).catch(() => {});
          }
        }
      }
    }

    // Notificações de atualização de status (best-effort)
    const notifyEmail   = updates.notifyEmail   !== false; // default: true
    const notifyWhatsApp = updates.notifyWhatsApp === true; // default: false
    if (updates.status && (notifyEmail || notifyWhatsApp)) {
      try {
        const { rows: oRows } = await pool.query(
          `SELECT o.order_number, o.created_by, o.customer_id,
                  o.customer_phone,
                  p.email, p.name, p.phone AS profile_phone
           FROM orders o
           LEFT JOIN profiles p ON p.id = o.created_by
           WHERE o.id = $1`, [req.params.id]
        );
        if (oRows.length) {
          const row = oRows[0];
          let email = row.email;
          let name = row.name;
          let phone = row.profile_phone || row.customer_phone;

          // Fallback via customer_id se created_by for nulo
          if ((!email || !phone) && row.customer_id) {
            const { rows: cRows } = await pool.query(
              'SELECT p.email, p.name, p.phone FROM profiles p WHERE p.customer_id = $1 LIMIT 1',
              [row.customer_id]
            );
            if (cRows.length) {
              if (!email) { email = cRows[0].email; name = cRows[0].name; }
              if (!phone) phone = cRows[0].phone;
            }
          }

          if (notifyEmail && email) {
            sendOrderStatusEmail({ to: email, name, orderNumber: row.order_number, status: updates.status }).catch(() => {});
          }

          if (notifyWhatsApp && phone) {
            const appUrl = process.env.APP_URL || 'https://www.natur-erva.co.mz';
            const n = name || 'cliente';
            const order_num = row.order_number;
            const waMessages = {
              confirmed:
                `Olá *${n}*! 🎉\n\nO pagamento do seu pedido *#${order_num}* foi confirmado e validado com sucesso.\n\nEstamos já a preparar os seus produtos. Obrigado pela confiança!\n\n🌿 *NaturErva*`,
              processing:
                `Olá *${n}*! 📦\n\nO seu pedido *#${order_num}* está em processamento — estamos a embalar os seus produtos com todo o cuidado.\n\nEm breve sairá para entrega!\n\n🌿 *NaturErva*`,
              out_for_delivery:
                `Olá *${n}*! 🚚\n\nBoa notícia! O seu pedido *#${order_num}* saiu para entrega e está a caminho.\n\nEsteja disponível para o receber. Caso tenha alguma dúvida, contacte-nos.\n\nAcompanhe aqui: ${appUrl}/minha-conta/encomendas\n\n🌿 *NaturErva*`,
              delivered:
                `Olá *${n}*! 🎉\n\nO seu pedido *#${order_num}* foi entregue!\n\nEsperamos que goste dos produtos. Confirme a receção na sua conta:\n👉 ${appUrl}/minha-conta/encomendas\n\nObrigado por escolher NaturErva! 🌿`,
              completed:
                `Olá *${n}*! ✅\n\nO seu pedido *#${order_num}* foi concluído com sucesso.\n\nAgradeçemos a sua preferência! Volte sempre à NaturErva para mais produtos naturais e saudáveis 🌿\n\n👉 ${appUrl}/loja`,
              cancelled:
                `Olá *${n}*. ℹ️\n\nO seu pedido *#${order_num}* foi cancelado.\n\nSe tiver alguma dúvida ou quiser fazer um novo pedido, estamos sempre disponíveis para ajudar.\n\n🌿 *NaturErva* — ${appUrl}`,
            };
            const msg = waMessages[updates.status]
              || `Olá *${n}*! O seu pedido *#${order_num}* foi atualizado. Acompanhe em: ${appUrl}/minha-conta/encomendas\n\n🌿 *NaturErva*`;
            sendWhatsAppMessage({ phone, message: msg }).catch(() => {});
          }
        }
      } catch {}
    }

    // Atribuir pontos de fidelidade quando pedido é entregue/concluído (best-effort)
    if (updates.status === 'delivered' || updates.status === 'completed') {
      awardOrderPoints(req.params.id).catch(pErr =>
        console.warn('[Orders] loyalty award error:', pErr.message)
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /orders]', err);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar pedido' });
  }
});

// DELETE /api/orders (bulk)
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.json({ success: true, deleted: 0, errors: [] });
    await pool.query('DELETE FROM orders WHERE id = ANY($1)', [ids]);
    res.json({ success: true, deleted: ids.length, errors: [] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar pedidos' });
  }
});

export default router;
export { repriceCustomerOrder, isStaffRequest, PricingError };
