import React, { useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { uploadService } from '../../../../services/uploadService';
import type { PaymentMethodConfig } from '../../../core/services/systemSettingsService';
import { PaymentMethodLogo } from '../../../shop/components/PaymentMethodLogo';

/**
 * Configuração dos métodos de pagamento móvel do checkout (M-Pesa, e-Mola).
 * Cada método: activo, código do comerciante, nome mostrado ao cliente, USSD e logótipo.
 * Guardado com o resto da configuração (PUT /api/tax/config → tax_config.payment_methods).
 */
export const PAYMENT_METHOD_DEFAULTS: PaymentMethodConfig[] = [
  { id: 'mpesa', label: 'M-Pesa', enabled: false, merchantCode: '', merchantName: 'Natur Erva', ussd: '*150#', logoUrl: '' },
  { id: 'emola', label: 'e-Mola', enabled: false, merchantCode: '', merchantName: 'Natur Erva', ussd: '*898#', logoUrl: '' },
];

export const withPaymentDefaults = (list?: PaymentMethodConfig[]): PaymentMethodConfig[] =>
  PAYMENT_METHOD_DEFAULTS.map(def => ({ ...def, ...(list || []).find(m => m.id === def.id) }));

interface Props {
  value: PaymentMethodConfig[];
  onChange: (next: PaymentMethodConfig[]) => void;
  inputCls: string;
  labelCls: string;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PaymentMethodsSettings: React.FC<Props> = ({ value, onChange, inputCls, labelCls, showToast }) => {
  const methods = withPaymentDefaults(value);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const update = (id: string, patch: Partial<PaymentMethodConfig>) =>
    onChange(methods.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const uploadLogo = async (id: string, file?: File) => {
    if (!file) return;
    setUploading(id);
    try {
      const result = await uploadService.uploadImage(file, 'logo', 600);
      if (result?.url) { update(id, { logoUrl: result.url }); showToast?.('Logótipo carregado — clique em Guardar para aplicar', 'success'); }
      else showToast?.('Erro ao carregar o logótipo', 'error');
    } catch (e: any) {
      showToast?.(e?.message || 'Erro ao carregar o logótipo', 'error');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-3">
      {methods.map(m => (
        <div key={m.id} className={`rounded-2xl border p-4 space-y-4 transition-colors ${m.enabled ? 'border-green-300 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10' : 'border-border-default'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PaymentMethodLogo method={m.id} logoUrl={m.logoUrl} />
              <div className="min-w-0">
                <p className="font-semibold text-content-primary">{m.label}</p>
                <p className="text-xs text-content-muted">{m.enabled ? (m.merchantCode ? 'Activo no checkout' : 'Activo, mas falta o código do comerciante') : 'Desactivado'}</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0" aria-label={`Activar ${m.label}`}>
              <input type="checkbox" className="sr-only peer" checked={m.enabled} onChange={e => update(m.id, { enabled: e.target.checked })} />
              <span className="w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 transition-colors" />
              <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Código do comerciante</label>
              <input value={m.merchantCode} inputMode="numeric" placeholder="Fornecido pela operadora"
                onChange={e => update(m.id, { merchantCode: e.target.value.replace(/\s+/g, '') })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nome mostrado ao cliente</label>
              <input value={m.merchantName} placeholder="Natur Erva"
                onChange={e => update(m.id, { merchantName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Código USSD</label>
              <input value={m.ussd} placeholder={m.id === 'emola' ? '*898#' : '*150#'}
                onChange={e => update(m.id, { ussd: e.target.value.trim() })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Logótipo</label>
              <div className="flex items-center gap-2">
                <input ref={el => { fileRefs.current[m.id] = el; }} type="file" accept="image/*" className="hidden"
                  onChange={e => { uploadLogo(m.id, e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" onClick={() => fileRefs.current[m.id]?.click()} disabled={uploading === m.id}
                  className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-border-default text-sm font-medium text-content-secondary hover:bg-surface-base disabled:opacity-60">
                  {uploading === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {m.logoUrl ? 'Trocar logótipo' : 'Carregar logótipo'}
                </button>
                {m.logoUrl && (
                  <button type="button" onClick={() => update(m.id, { logoUrl: '' })} aria-label={`Remover logótipo ${m.label}`}
                    className="tap-target w-10 h-10 inline-flex items-center justify-center rounded-xl border border-border-default text-content-muted hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PaymentMethodsSettings;
