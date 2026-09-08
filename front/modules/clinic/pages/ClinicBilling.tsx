import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageShell } from '../../core/components/layout/PageShell';
import api, { downloadBlob } from '../../core/services/apiClient';
import { useConfirm } from '../../core/contexts/ConfirmContext';
import {
  Plus, Trash2, Pencil, Loader2, Download, ToggleLeft, ToggleRight,
  Receipt, Wallet, Clock, Ban, Tag,
} from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';
import { Modal, KpiCard, inputCls, labelCls, Patient } from '../shared';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type ServiceType = 'servico' | 'pacote';
type ClinicService = {
  id: string; name: string; type: ServiceType; durationMinutes?: number | null;
  price: number; includes?: string | null; isActive: boolean; displayOrder: number;
};
type InvoiceItem = { serviceId: string; name: string; quantity: number; unitPrice: number };
type InvoiceStatus = 'pendente' | 'pago' | 'cancelado';
type ClinicInvoice = {
  id: string; invoiceNumber: string; patientId?: string | null; customerName: string; customerPhone?: string;
  items: InvoiceItem[]; subtotal: number; discount: number; total: number;
  status: InvoiceStatus; paymentMethod?: string | null; notes?: string | null; createdAt: string;
};

const TAB = { PRICING: 'pricing', BILLING: 'billing' } as const;
type Tab = typeof TAB[keyof typeof TAB];

const STATUS_LABELS: Record<InvoiceStatus, string> = { pendente: 'Pendente', pago: 'Pago', cancelado: 'Cancelado' };
const STATUS_COLORS: Record<InvoiceStatus, string> = {
  pendente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pago: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const fmtMT = (n: number) => `${n.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

const EMPTY_SERVICE_FORM = { name: '', type: 'servico' as ServiceType, durationMinutes: '', price: '', includes: '' };
const EMPTY_INVOICE_FORM = { patientId: '', customerName: '', customerPhone: '', discount: '', notes: '' };

export function ClinicBilling({ showToast }: Props) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(TAB.PRICING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [services, setServices] = useState<ClinicService[]>([]);
  const [invoices, setInvoices] = useState<ClinicInvoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const [serviceModal, setServiceModal] = useState<null | 'new' | ClinicService>(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE_FORM);

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(EMPTY_INVOICE_FORM);
  const [invoiceItems, setInvoiceItems] = useState<{ serviceId: string; quantity: string }[]>([{ serviceId: '', quantity: '1' }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, inv, p] = await Promise.all([
        api.get<ClinicService[]>('/clinic/services?includeInactive=true'),
        api.get<ClinicInvoice[]>('/clinic/invoices'),
        api.get<Patient[]>('/clinic/patients'),
      ]);
      setServices(s); setInvoices(inv); setPatients(p);
    } catch { showToast?.('Erro ao carregar faturação da clínica', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const activeServices = useMemo(() => services.filter(s => s.isActive), [services]);

  // ── Catálogo de preços ────────────────────────────────────────────────────

  const openNewService = () => { setServiceForm(EMPTY_SERVICE_FORM); setServiceModal('new'); };
  const openEditService = (s: ClinicService) => {
    setServiceForm({
      name: s.name, type: s.type,
      durationMinutes: s.durationMinutes != null ? String(s.durationMinutes) : '',
      price: String(s.price), includes: s.includes || '',
    });
    setServiceModal(s);
  };

  const saveService = async () => {
    if (!serviceForm.name.trim() || !serviceForm.price) return;
    setSaving(true);
    try {
      const payload = {
        name: serviceForm.name.trim(), type: serviceForm.type,
        durationMinutes: serviceForm.durationMinutes ? Number(serviceForm.durationMinutes) : null,
        price: Number(serviceForm.price), includes: serviceForm.includes || null,
      };
      if (serviceModal === 'new') {
        await api.post('/clinic/services', payload);
        showToast?.('Serviço criado', 'success');
      } else if (serviceModal) {
        await api.put(`/clinic/services/${serviceModal.id}`, payload);
        showToast?.('Serviço atualizado', 'success');
      }
      setServiceModal(null);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao guardar serviço', 'error'); }
    finally { setSaving(false); }
  };

  const toggleServiceActive = async (s: ClinicService) => {
    try { await api.put(`/clinic/services/${s.id}`, { isActive: !s.isActive }); load(); }
    catch { showToast?.('Erro ao atualizar serviço', 'error'); }
  };

  const deleteService = async (s: ClinicService) => {
    const ok = await confirm(`Remover "${s.name}" da tabela de preços? Faturas já emitidas não são afetadas.`, { title: 'Remover Serviço', confirmLabel: 'Remover', variant: 'danger' });
    if (!ok) return;
    try { await api.delete(`/clinic/services/${s.id}`); showToast?.('Serviço removido', 'success'); load(); }
    catch { showToast?.('Erro ao remover serviço', 'error'); }
  };

  // ── Faturação ──────────────────────────────────────────────────────────────

  const openNewInvoice = () => {
    setInvoiceForm(EMPTY_INVOICE_FORM);
    setInvoiceItems([{ serviceId: '', quantity: '1' }]);
    setInvoiceModal(true);
  };

  const invoiceTotals = useMemo(() => {
    const subtotal = invoiceItems.reduce((sum, it) => {
      const svc = activeServices.find(s => s.id === it.serviceId);
      const qty = Number(it.quantity) || 0;
      return sum + (svc ? svc.price * qty : 0);
    }, 0);
    const discount = Number(invoiceForm.discount) || 0;
    return { subtotal, discount, total: Math.max(0, subtotal - discount) };
  }, [invoiceItems, invoiceForm.discount, activeServices]);

  const saveInvoice = async () => {
    if (!invoiceForm.customerName.trim()) return;
    const items = invoiceItems.filter(it => it.serviceId && Number(it.quantity) > 0)
      .map(it => ({ serviceId: it.serviceId, quantity: Number(it.quantity) }));
    if (!items.length) { showToast?.('Adicione pelo menos um serviço', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/clinic/invoices', {
        patientId: invoiceForm.patientId || null,
        customerName: invoiceForm.customerName.trim(),
        customerPhone: invoiceForm.customerPhone || undefined,
        items, discount: Number(invoiceForm.discount) || 0,
        notes: invoiceForm.notes || undefined,
      });
      showToast?.('Fatura criada', 'success');
      setInvoiceModal(false);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao criar fatura', 'error'); }
    finally { setSaving(false); }
  };

  const setInvoiceStatus = async (inv: ClinicInvoice, status: InvoiceStatus) => {
    try { await api.put(`/clinic/invoices/${inv.id}`, { status }); load(); }
    catch { showToast?.('Erro ao atualizar fatura', 'error'); }
  };

  const downloadInvoicePdf = async (inv: ClinicInvoice) => {
    try { await downloadBlob(`/pdf/clinic-invoice/${inv.id}`, `recibo-clinica-${inv.invoiceNumber}.pdf`); }
    catch { showToast?.('Erro ao gerar PDF', 'error'); }
  };

  const kpis = useMemo(() => {
    const pendente = invoices.filter(i => i.status === 'pendente').reduce((s, i) => s + i.total, 0);
    const pago = invoices.filter(i => i.status === 'pago').reduce((s, i) => s + i.total, 0);
    return { pendente, pago, count: invoices.length };
  }, [invoices]);

  return (
    <PageShell title="Faturação da Clínica" description="Tabela de preços e recibos próprios da clínica, independentes da loja"
      actions={
        tab === TAB.PRICING ? (
          <button onClick={openNewService}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo Serviço/Pacote
          </button>
        ) : (
          <button onClick={openNewInvoice}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Nova Fatura
          </button>
        )
      }>
      <div className="bg-surface-raised rounded-2xl border border-border-default overflow-hidden">
        <div className="flex border-b border-border-default overflow-x-auto">
          {[
            { id: TAB.PRICING, label: 'Tabela de Preços', icon: Tag },
            { id: TAB.BILLING, label: 'Faturação', icon: Receipt },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' : 'border-transparent text-content-muted hover:text-content-primary'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
          ) : tab === TAB.PRICING ? (
            <div className="space-y-2">
              {services.map(s => (
                <div key={s.id} className="border border-border-default rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-content-primary">{s.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type === 'pacote' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                        {s.type === 'pacote' ? 'Pacote' : 'Serviço'}
                      </span>
                      {!s.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Inativo</span>}
                    </div>
                    <p className="text-xs text-content-muted mt-1">
                      {fmtMT(s.price)}{s.durationMinutes ? ` · ${s.durationMinutes} min.` : ''}{s.includes ? ` · ${s.includes}` : ''}
                    </p>
                  </div>
                  <button onClick={() => toggleServiceActive(s)} title={s.isActive ? 'Desativar' : 'Ativar'} className="shrink-0 text-content-muted hover:text-brand-600">
                    {s.isActive ? <ToggleRight className="w-6 h-6 text-brand-600" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button onClick={() => openEditService(s)} title="Editar" className="shrink-0 p-1.5 rounded-lg text-content-muted hover:bg-surface-overlay">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteService(s)} title="Remover" className="shrink-0 p-1.5 rounded-lg text-content-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {services.length === 0 && <p className="text-center py-12 text-content-muted">Nenhum serviço ou pacote na tabela de preços.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard label="Pendente" value={fmtMT(kpis.pendente)} sub="por receber"
                  icon={<Clock className="w-4 h-4 text-yellow-600" />} accent="bg-yellow-50 dark:bg-yellow-900/20" />
                <KpiCard label="Pago" value={fmtMT(kpis.pago)} sub="recebido"
                  icon={<Wallet className="w-4 h-4 text-green-600" />} accent="bg-green-50 dark:bg-green-900/20" />
                <KpiCard label="Faturas" value={kpis.count} sub="no total"
                  icon={<Receipt className="w-4 h-4 text-brand-600" />} accent="bg-brand-50 dark:bg-brand-900/20" />
              </div>

              <div className="space-y-2">
                {invoices.map(inv => (
                  <div key={inv.id} className="border border-border-default rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-content-primary">{inv.invoiceNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}>{STATUS_LABELS[inv.status]}</span>
                        </div>
                        <p className="text-xs text-content-muted mt-1">{inv.customerName}{inv.customerPhone ? ` · ${inv.customerPhone}` : ''}</p>
                        <p className="text-xs text-content-muted mt-0.5">{inv.items.map(it => `${it.quantity}× ${it.name}`).join(', ')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-content-primary">{fmtMT(inv.total)}</span>
                        <button onClick={() => downloadInvoicePdf(inv)} title="Baixar recibo em PDF" className="p-1.5 rounded-lg text-content-muted hover:bg-surface-overlay">
                          <Download className="w-4 h-4" />
                        </button>
                        {inv.status === 'pendente' && (
                          <>
                            <button onClick={() => setInvoiceStatus(inv, 'pago')}
                              className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-lg hover:bg-green-100">
                              Marcar como pago
                            </button>
                            <button onClick={() => setInvoiceStatus(inv, 'cancelado')} title="Cancelar"
                              className="p-1.5 rounded-lg text-content-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                              <Ban className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {invoices.length === 0 && <p className="text-center py-12 text-content-muted">Nenhuma fatura emitida ainda.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Novo/Editar Serviço */}
      {serviceModal && (
        <Modal title={serviceModal === 'new' ? 'Novo Serviço/Pacote' : 'Editar Serviço/Pacote'} onClose={() => setServiceModal(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome *</label>
              <input value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
            </div>
            <div className="flex border border-border-default rounded-lg p-1 bg-surface-base">
              <button onClick={() => setServiceForm(p => ({ ...p, type: 'servico' }))}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${serviceForm.type === 'servico' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}>
                Serviço avulso
              </button>
              <button onClick={() => setServiceForm(p => ({ ...p, type: 'pacote' }))}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${serviceForm.type === 'pacote' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}>
                Pacote
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {serviceForm.type === 'servico' ? (
                <div>
                  <label className={labelCls}>Duração (min.)</label>
                  <input type="number" min="0" value={serviceForm.durationMinutes} onChange={e => setServiceForm(p => ({ ...p, durationMinutes: e.target.value }))} className={inputCls} />
                </div>
              ) : <div />}
              <div>
                <label className={labelCls}>Preço (MT) *</label>
                <input type="number" min="0" step="0.01" value={serviceForm.price} onChange={e => setServiceForm(p => ({ ...p, price: e.target.value }))} className={inputCls} />
              </div>
            </div>
            {serviceForm.type === 'pacote' && (
              <div>
                <label className={labelCls}>Inclui</label>
                <textarea value={serviceForm.includes} onChange={e => setServiceForm(p => ({ ...p, includes: e.target.value }))} rows={2}
                  placeholder="Ex: Biorressonância + consulta nutricional + plano alimentar" className={inputCls} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setServiceModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveService} disabled={saving || !serviceForm.name.trim() || !serviceForm.price}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Nova Fatura */}
      {invoiceModal && (
        <Modal title="Nova Fatura" onClose={() => setInvoiceModal(false)} wide>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Paciente (opcional)</label>
              <select value={invoiceForm.patientId} onChange={e => {
                const patient = patients.find(p => p.id === e.target.value);
                setInvoiceForm(p => ({
                  ...p, patientId: e.target.value,
                  customerName: patient ? patient.customerName : p.customerName,
                  customerPhone: patient ? (patient.customerPhone || '') : p.customerPhone,
                }));
              }} className={inputCls}>
                <option value="">Sem paciente associado</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.customerName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome do cliente *</label>
                <input value={invoiceForm.customerName} onChange={e => setInvoiceForm(p => ({ ...p, customerName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={invoiceForm.customerPhone} onChange={e => setInvoiceForm(p => ({ ...p, customerPhone: e.target.value }))} className={inputCls} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>Serviços</label>
                <button onClick={() => setInvoiceItems(p => [...p, { serviceId: '', quantity: '1' }])} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  + Adicionar linha
                </button>
              </div>
              <div className="space-y-2">
                {invoiceItems.map((it, idx) => {
                  const svc = activeServices.find(s => s.id === it.serviceId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={it.serviceId} onChange={e => setInvoiceItems(p => p.map((row, i) => i === idx ? { ...row, serviceId: e.target.value } : row))}
                        className={inputCls + ' flex-1'}>
                        <option value="">Selecionar serviço/pacote…</option>
                        <optgroup label="Serviços">
                          {activeServices.filter(s => s.type === 'servico').map(s => <option key={s.id} value={s.id}>{s.name} — {fmtMT(s.price)}</option>)}
                        </optgroup>
                        <optgroup label="Pacotes">
                          {activeServices.filter(s => s.type === 'pacote').map(s => <option key={s.id} value={s.id}>{s.name} — {fmtMT(s.price)}</option>)}
                        </optgroup>
                      </select>
                      <input type="number" min="1" value={it.quantity} onChange={e => setInvoiceItems(p => p.map((row, i) => i === idx ? { ...row, quantity: e.target.value } : row))}
                        className={inputCls + ' w-20'} />
                      <span className="text-sm text-content-muted w-24 text-right shrink-0">{svc ? fmtMT(svc.price * (Number(it.quantity) || 0)) : '—'}</span>
                      <button onClick={() => setInvoiceItems(p => p.filter((_, i) => i !== idx))} disabled={invoiceItems.length === 1}
                        className="p-1.5 rounded-lg text-content-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className={labelCls}>Desconto (MT)</label>
                <input type="number" min="0" step="0.01" value={invoiceForm.discount} onChange={e => setInvoiceForm(p => ({ ...p, discount: e.target.value }))} className={inputCls} />
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-xs text-content-muted">Subtotal: {fmtMT(invoiceTotals.subtotal)}</p>
                <p className="text-base font-semibold text-content-primary">Total: {fmtMT(invoiceTotals.total)}</p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={invoiceForm.notes} onChange={e => setInvoiceForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls} />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setInvoiceModal(false)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveInvoice} disabled={saving || !invoiceForm.customerName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Criar Fatura
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

export default ClinicBilling;
