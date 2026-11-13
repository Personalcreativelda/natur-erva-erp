/**
 * Formato dos códigos de transação M-Pesa / e-Mola.
 * Mesmas regras do servidor (backend/services/paymentService.js → detectTxMethod) — manter iguais.
 *  • M-Pesa: 11 caracteres, começa por letra, com pelo menos um número   → DKD2MBCPN4A
 *  • e-Mola: 2 letras + AAMMDD + HHMM + sufixo (letra + 4–7)             → MP261104.1749.e44538
 */
export type TxMethod = 'mpesa' | 'emola';

export const TX_EXAMPLES: Record<TxMethod, string> = {
  mpesa: 'DKD2MBCPN4A',
  emola: 'MP261104.1749.e44538',
};

const MPESA_TX_RE = /^[A-Z](?=[A-Z0-9]*\d)[A-Z0-9]{10}$/;
const EMOLA_TX_RE = /^[A-Z]{2}(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})[A-Z][A-Z0-9]{4,7}$/;

/** Maiúsculas, sem espaços nem pontos (forma guardada no servidor). */
export const normalizeTxId = (value: string) => value.replace(/[\s.]/g, '').toUpperCase();

export function detectTxMethod(code: string): TxMethod | null {
  const id = normalizeTxId(code);
  if (MPESA_TX_RE.test(id)) return 'mpesa';
  const m = id.match(EMOLA_TX_RE);
  if (m) {
    const [, , mm, dd, hh, mi] = m.map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh <= 23 && mi <= 59) return 'emola';
  }
  return null;
}

/** Tira o código de uma SMS colada (M-Pesa: "Confirmado XXXX." · e-Mola: "ID Trans: MP….…"). */
export function extractTxCode(text: string): string | null {
  const t = text.trim();
  const emola = t.match(/\b([A-Z]{2}\d{6}\.\d{4}\.[A-Z][A-Z0-9]{4,7})\b/i)?.[1];
  if (emola) return emola;
  const confirmed = t.match(/Confirmad[oa]\.?\s+([A-Z0-9]{11})\b/i)?.[1];
  if (confirmed) return confirmed;
  // Código solto (o cliente escreveu só o código)
  const lone = t.replace(/\s+/g, '');
  if (lone.length <= 24 && detectTxMethod(lone)) return lone;
  return null;
}

export const methodName = (m: string) => (m === 'emola' ? 'e-Mola' : 'M-Pesa');

/** ok=true → `code` válido. ok=false → `error` (null = ainda a escrever, sem mensagem). */
export interface TxCheck {
  ok: boolean;
  code?: string;
  isSms?: boolean;
  error?: string | null;
}

/** Valida o que o cliente escreveu/colou para o método escolhido. error=null → ainda a escrever. */
export function checkTxInput(raw: string, method: string): TxCheck {
  const value = raw.trim();
  if (!value) return { ok: false, error: null };
  const isSms = /\s/.test(value) && value.length > 24;
  const code = extractTxCode(value);
  const chosen = (method === 'emola' ? 'emola' : 'mpesa') as TxMethod;
  if (!code) {
    return {
      ok: false,
      error: isSms
        ? `Não encontrámos o código nesta SMS. Escreva só o código (ex.: ${TX_EXAMPLES[chosen]}).`
        : `Formato inválido. O código ${methodName(chosen)} é assim: ${TX_EXAMPLES[chosen]}.`,
    };
  }
  const detected = detectTxMethod(code);
  if (detected && detected !== chosen) {
    return { ok: false, error: `Este código é do ${methodName(detected)}, mas escolheu ${methodName(chosen)}.` };
  }
  return { ok: true, code, isSms };
}
