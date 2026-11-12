/**
 * Tabelas largas no telemóvel → cartões.
 *
 * Várias páginas do admin (cotações, movimentos, cupões, contas a pagar…) usam tabelas com
 * mais colunas do que cabem num ecrã de 390px: o utilizador tinha de deslizar na horizontal e
 * os valores apareciam cortados. Em vez de reescrever cada página, em ecrãs ≤ 640px:
 *  - só as tabelas que NÃO cabem na largura disponível recebem a classe `table-cards`;
 *  - cada <td> recebe `data-label` com o texto do cabeçalho da coluna;
 *  - o CSS (index.html) mostra cada linha como um cartão "Coluna ........ valor".
 * Tabelas que cabem no ecrã e todo o desktop ficam exactamente como estavam.
 */

const MOBILE = '(max-width: 640px)';

const headerLabels = (table: HTMLTableElement): string[] => {
  const row = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!row) return [];
  const labels: string[] = [];
  for (const th of Array.from(row.cells)) {
    const text = (th.textContent || '').trim().replace(/\s+/g, ' ');
    for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
  }
  return labels;
};

const labelCells = (table: HTMLTableElement, labels: string[]) => {
  for (const body of Array.from(table.tBodies)) {
    for (const tr of Array.from(body.rows)) {
      let col = 0;
      for (const td of Array.from(tr.cells)) {
        const label = labels[col] ?? '';
        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
        col += td.colSpan || 1;
      }
    }
  }
};

const process = () => {
  const mobile = window.matchMedia(MOBILE).matches;
  for (const table of Array.from(document.querySelectorAll<HTMLTableElement>('main table, [role="dialog"] table, .fixed table'))) {
    if (!mobile) { table.classList.remove('table-cards'); continue; }
    const labels = headerLabels(table);
    if (labels.length < 3) continue; // tabelas simples (2 colunas) cabem bem como estão

    if (!table.classList.contains('table-cards')) {
      const container = table.parentElement;
      const available = container ? container.clientWidth : window.innerWidth;
      if (table.scrollWidth <= available + 4) continue; // cabe no ecrã → não mexer
      table.classList.add('table-cards');
    }
    labelCells(table, labels);
  }
};

let installed = false;

export const installResponsiveTables = (): (() => void) => {
  if (installed) return () => {};
  installed = true;
  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(process, 150); };
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true });
  const mq = window.matchMedia(MOBILE);
  mq.addEventListener('change', schedule);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    installed = false;
    clearTimeout(timer);
    mo.disconnect();
    mq.removeEventListener('change', schedule);
    window.removeEventListener('resize', schedule);
  };
};
