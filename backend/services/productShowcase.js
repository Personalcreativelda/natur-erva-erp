/**
 * Montra de produtos para marketing (estilo das lojas online):
 *   • email   → grelha de cartões (foto, nome, preço antigo riscado, preço actual, botão "Comprar")
 *   • WhatsApp → cada produto como foto com legenda (nome, preço e link)
 * Usado nas campanhas (routes/marketing.js) e na automação "Novidades e promoções".
 */
import pool from '../db.js';

const APP_URL = () => (process.env.APP_URL || process.env.FRONTEND_URL || 'https://www.natur-erva.co.mz').replace(/\/$/, '');
const fmtMT = (n) => `${Number(n || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Promoção activa = mesma regra da loja (front/modules/shop/utils/pricing.ts)
const PRODUCT_SQL = `
  SELECT p.id::text, p.name, p.slug, p.image, p.price::float AS price,
         CASE WHEN p.promotional_price > 0 AND p.promotional_price < p.price
               AND (p.promotional_price_start IS NULL OR p.promotional_price_start <= CURRENT_DATE)
               AND (p.promotional_price_end   IS NULL OR p.promotional_price_end   >= CURRENT_DATE)
              THEN p.promotional_price::float END AS promo_price,
         p.promotional_price_end AS promo_until, p.category, p.created_at
    FROM products p
   WHERE p.show_in_shop IS TRUE`;

const shape = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  image: r.image || null,
  price: Number(r.price) || 0,
  promoPrice: r.promo_price != null ? Number(r.promo_price) : null,
  isPromo: r.promo_price != null,
  discountPercent: r.promo_price != null && r.price > 0 ? Math.round((1 - r.promo_price / r.price) * 100) : 0,
  promoUntil: r.promo_until || null,
  category: r.category || null,
  url: `${APP_URL()}/loja/produto/${r.slug}`,
});

/** Produtos da loja para escolher na montra: promoções primeiro, depois os mais recentes. */
export async function listShowcaseProducts(limit = 200) {
  const { rows } = await pool.query(
    `${PRODUCT_SQL} ORDER BY (CASE WHEN p.promotional_price > 0 AND p.promotional_price < p.price
                                     AND (p.promotional_price_start IS NULL OR p.promotional_price_start <= CURRENT_DATE)
                                     AND (p.promotional_price_end IS NULL OR p.promotional_price_end >= CURRENT_DATE)
                                    THEN 0 ELSE 1 END), p.created_at DESC
     LIMIT $1`,
    [Math.min(Number(limit) || 200, 500)]
  );
  return rows.map(shape);
}

/** Produtos pelos ids, na ordem pedida. */
export async function getShowcaseProducts(ids = []) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(0, 12);
  if (!list.length) return [];
  const { rows } = await pool.query(`${PRODUCT_SQL} AND p.id::text = ANY($1)`, [list]);
  const byId = new Map(rows.map(r => [r.id, shape(r)]));
  return list.map(id => byId.get(id)).filter(Boolean);
}

// ── Email ───────────────────────────────────────────────────────────────────────────────────────
function productCell(p) {
  const img = p.image
    ? `<a href="${esc(p.url)}" style="text-decoration:none;display:block;text-align:center"><img src="${esc(p.image)}" alt="${esc(p.name)}" height="160" style="display:inline-block;height:160px;width:auto;max-width:100%;border-radius:8px;border:0"></a>`
    : `<div style="height:160px;background:#f0fdf4;border-radius:10px"></div>`;
  const badge = p.isPromo && p.discountPercent > 0
    ? `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px;margin-bottom:6px">-${p.discountPercent}%</span><br>`
    : '';
  const price = p.isPromo
    ? `<span style="color:#9ca3af;text-decoration:line-through;font-size:13px">${fmtMT(p.price)}</span><br><span style="color:#dc2626;font-size:18px;font-weight:700">${fmtMT(p.promoPrice)}</span>`
    : `<span style="color:#15803d;font-size:18px;font-weight:700">${fmtMT(p.price)}</span>`;
  return `
    <td width="50%" valign="top" style="padding:6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px">
        <tr><td style="padding:10px">${img}</td></tr>
        <tr><td style="padding:0 12px 12px;font-family:Arial,sans-serif">
          ${badge}
          <a href="${esc(p.url)}" style="color:#111827;text-decoration:none;font-size:14px;font-weight:600;line-height:1.35;display:block;min-height:38px">${esc(p.name)}</a>
          <div style="margin:6px 0 10px;line-height:1.3">${price}</div>
          <a href="${esc(p.url)}" style="display:block;text-align:center;background:#16a34a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 0;border-radius:8px">Comprar</a>
        </td></tr>
      </table>
    </td>`;
}

/** Grelha de 2 colunas em tabela (funciona no Gmail, Outlook e telemóvel). */
export function buildProductGridHtml(products, { title } = {}) {
  if (!products?.length) return '';
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const pair = products.slice(i, i + 2);
    rows.push(`<tr>${pair.map(productCell).join('')}${pair.length === 1 ? '<td width="50%" style="padding:6px"></td>' : ''}</tr>`);
  }
  return `
    ${title ? `<h2 style="font-size:18px;color:#15803d;margin:24px 0 8px">${esc(title)}</h2>` : '<div style="height:12px"></div>'}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate">${rows.join('')}</table>
    <p style="text-align:center;margin:18px 0 0"><a href="${APP_URL()}/" style="color:#16a34a;font-weight:600;text-decoration:none">Ver todos os produtos →</a></p>`;
}

// ── WhatsApp ────────────────────────────────────────────────────────────────────────────────────
/** Legenda da foto do produto no WhatsApp. */
export function productCaption(p) {
  const price = p.isPromo
    ? `~${fmtMT(p.price)}~ *${fmtMT(p.promoPrice)}*${p.discountPercent > 0 ? ` (-${p.discountPercent}%)` : ''}`
    : `*${fmtMT(p.price)}*`;
  return `*${p.name}*\n${price}\n\n🛒 ${p.url}`;
}

/** Linha de texto (quando o produto não tem foto ou para listas). */
export function productLine(p) {
  const price = p.isPromo ? `~${fmtMT(p.price)}~ *${fmtMT(p.promoPrice)}*` : fmtMT(p.price);
  return `• *${p.name}* — ${price}\n  ${p.url}`;
}
