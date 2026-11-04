/**
 * Move as fotos de produtos guardadas como texto base64 na base de dados para o MinIO
 * e substitui-as pelo URL público. Cada pedido GET /products passa de ~1 MB para ~50 KB.
 *
 * Uso (na pasta backend):
 *   node run-migrate-base64-images.js            → simulação: só mostra o que faria
 *   node run-migrate-base64-images.js --apply    → aplica (grava cópia de segurança antes)
 *
 * Reverter: node run-migrate-base64-images.js --restore base64-images-backup-<data>.json
 */
import 'dotenv/config';
import fs from 'fs';
import pool from './db.js';
import { uploadToMinio } from './storage/minio.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : null;

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of rows) {
    await pool.query('UPDATE products SET image = $1 WHERE id = $2', [r.image, r.id]);
    console.log('reposto:', r.name);
  }
}

async function migrate() {
  const rows = (await pool.query(`SELECT id, name, image FROM products WHERE image LIKE 'data:%'`)).rows;
  if (!rows.length) { console.log('Nada a migrar: nenhuma foto em base64.'); return; }

  for (const r of rows) console.log(`- ${r.name}: ${(r.image.length / 1024).toFixed(0)} KB em base64`);
  if (!APPLY) { console.log('\nSimulação. Para aplicar: node run-migrate-base64-images.js --apply'); return; }

  const backup = `base64-images-backup-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(backup, JSON.stringify(rows));
  console.log(`\nCópia de segurança: ${backup}`);

  for (const r of rows) {
    const m = r.image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!m) { console.log('IGNORADO (formato inesperado):', r.name); continue; }
    const buffer = Buffer.from(m[2], 'base64');
    const { url } = await uploadToMinio(buffer, 'products', m[1]);
    // Só substitui se a foto não mudou entretanto
    const res = await pool.query('UPDATE products SET image = $1 WHERE id = $2 AND image = $3', [url, r.id, r.image]);
    console.log(res.rowCount ? 'OK' : 'NÃO ALTERADO', '|', r.name, '→', url);
  }
  const left = (await pool.query(`SELECT count(*)::int AS n FROM products WHERE image LIKE 'data:%'`)).rows[0].n;
  console.log('Restantes em base64:', left);
}

try {
  if (RESTORE) await restore(RESTORE); else await migrate();
} catch (e) {
  console.error('Erro:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
