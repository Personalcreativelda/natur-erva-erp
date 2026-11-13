import React from 'react';

/**
 * Logótipo do método de pagamento. Usa a imagem carregada no painel (Finanças → Métodos de
 * pagamento); sem imagem, mostra o nome com a cor da marca.
 */
const BRAND: Record<string, { bg: string; text: string; label: string }> = {
  mpesa: { bg: '#E60000', text: '#FFFFFF', label: 'M-PESA' },
  emola: { bg: '#F39200', text: '#FFFFFF', label: 'e-Mola' },
};

export const PaymentMethodLogo: React.FC<{ method: string; logoUrl?: string; size?: 'sm' | 'md' | 'lg' }> = ({ method, logoUrl, size = 'md' }) => {
  const dims = size === 'lg' ? 'h-12 min-w-[96px]' : size === 'sm' ? 'h-6 min-w-[48px]' : 'h-9 min-w-[72px]';
  if (logoUrl) {
    return <img src={logoUrl} alt={BRAND[method]?.label || method} className={`${dims} w-auto object-contain`} loading="lazy" />;
  }
  const b = BRAND[method] || { bg: '#374151', text: '#fff', label: method };
  return (
    <span
      className={`${dims} inline-flex items-center justify-center rounded-lg px-3 font-extrabold tracking-tight ${size === 'sm' ? 'text-[11px]' : size === 'lg' ? 'text-lg' : 'text-sm'}`}
      style={{ background: b.bg, color: b.text }}
      aria-label={b.label}
    >
      {b.label}
    </span>
  );
};

export default PaymentMethodLogo;
