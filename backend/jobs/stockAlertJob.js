import cron from 'node-cron';
import pool from '../db.js';
import { listLowStockProducts, sendEvolutionMessage } from '../services/assistantService.js';

const RENOTIFY_HOURS = 24;

async function runStockAlertCheck() {
  try {
    const { rows: configRows } = await pool.query('SELECT * FROM assistant_config WHERE id = 1');
    const config = configRows[0];
    if (!config || !config.is_enabled) return;
    if (!config.authorized_numbers?.length) return;
    if (!config.evolution_base_url || !config.evolution_instance || !config.evolution_api_key) return;

    const { products } = await listLowStockProducts();
    if (!products.length) return;

    // Não repete o aviso do mesmo produto dentro da janela de RENOTIFY_HOURS
    const { rows: recentlyNotified } = await pool.query(
      `SELECT p.name FROM assistant_stock_alerts a
       JOIN products p ON p.id = a.product_id
       WHERE a.last_notified_at > NOW() - INTERVAL '${RENOTIFY_HOURS} hours'`
    );
    const recentlyNotifiedNames = new Set(recentlyNotified.map(r => r.name));
    const toNotify = products.filter(p => !recentlyNotifiedNames.has(p.name));
    if (!toNotify.length) return;

    const lines = toNotify.map(p => `• ${p.name}: ${p.stock} (mínimo ${p.minStock})`).join('\n');
    const message = `⚠️ Stock baixo em ${toNotify.length} produto(s):\n\n${lines}`;

    let sentToAtLeastOne = false;
    for (const phone of config.authorized_numbers) {
      try { await sendEvolutionMessage(config, phone, message); sentToAtLeastOne = true; }
      catch (err) { console.error(`[stockAlertJob] falha ao notificar ${phone}:`, err.message); }
    }

    // Só regista como notificado se pelo menos um envio teve sucesso — se a Evolution API
    // estiver em baixo, o alerta deve voltar a tentar na próxima corrida, não ficar silenciado.
    if (!sentToAtLeastOne) return;

    const { rows: productRows } = await pool.query(
      `SELECT id, name FROM products WHERE name = ANY($1::text[])`,
      [toNotify.map(p => p.name)]
    );
    for (const p of productRows) {
      await pool.query(
        `INSERT INTO assistant_stock_alerts (product_id, last_notified_at) VALUES ($1, NOW())
         ON CONFLICT (product_id) DO UPDATE SET last_notified_at = NOW()`,
        [p.id]
      );
    }
  } catch (err) {
    console.error('[stockAlertJob]', err);
  }
}

export function startStockAlertJob() {
  cron.schedule('0 */4 * * *', runStockAlertCheck);
  console.log('🔔 Job de alerta de stock (assistente WhatsApp) agendado — a cada 4 horas');
}

export { runStockAlertCheck };
