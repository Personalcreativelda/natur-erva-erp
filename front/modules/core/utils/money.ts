/**
 * Formatação de valores monetários — única para toda a área financeira.
 * Mesmo formato do Dashboard: locale de Moçambique (pt-MZ), MZN mostrado como "MT".
 * Ex.: 156531.64 → "156 531,64 MT"
 */
const formatter = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

export const formatMoney = (value: number | string | null | undefined): string =>
  formatter.format(Number(value) || 0).replace(/MZN/gi, 'MT').replace(/MTn/gi, 'MT');
