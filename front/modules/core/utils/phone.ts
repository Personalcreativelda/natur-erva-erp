/**
 * Clientes sem telefone são guardados com um identificador interno no campo telefone
 * (backend: `no_phone_<timestamp>_<n>` em customers.js, `np_<timestamp>` em orders.js), porque
 * o telefone é único na base de dados. Esse valor nunca deve aparecer ao utilizador.
 */
const PLACEHOLDER = /^(no_phone_|np_)/i;

/** Devolve o telefone real, ou '' se for um identificador interno. */
export const realPhone = (phone?: string | null): string =>
  phone && !PLACEHOLDER.test(phone) ? phone : '';
