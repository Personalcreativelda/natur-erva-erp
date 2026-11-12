/**
 * Limpa dist/ antes do build sem falhar quando uma pasta está em uso.
 *
 * No Windows, se algum processo tiver dist/assets aberto (uma janela do Explorador, um
 * terminal cujo directório actual é essa pasta, um servidor a servir dist/), o Vite falha com
 * "EPERM, Permission denied" ao tentar apagar a pasta. Aqui apagamos todos os FICHEIROS e só
 * as pastas que puderem ser removidas; o build corre depois com --emptyOutDir false.
 * O resultado é o mesmo de um build limpo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const clean = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      clean(p);
      try { fs.rmdirSync(p); } catch { /* pasta em uso — fica vazia, o build reutiliza-a */ }
    } else {
      fs.rmSync(p, { force: true });
    }
  }
};

if (fs.existsSync(dist)) clean(dist);
