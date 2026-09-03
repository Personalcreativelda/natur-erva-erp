import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../../core/components/layout/PageShell';
import api from '../../core/services/apiClient';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';
import {
  AREAS, PROTOCOL_STATUS_LABELS, PROTOCOL_STATUS_COLORS, inputCls, labelCls,
  Modal, AreaBadge, Patient, Protocol, ProtocolItem, ProductLite,
} from '../shared';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

export function ClinicProtocols({ showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  const [protocolModal, setProtocolModal] = useState(false);
  const [protocolForm, setProtocolForm] = useState({ patientId: '', area: AREAS[3].id as string, title: '', startDate: '', endDate: '', notes: '' });
  const [protocolItems, setProtocolItems] = useState<ProtocolItem[]>([{ productId: '', dosageText: '', frequencyText: '', quantityPerDispense: 1 }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, p] = await Promise.all([
        api.get<Protocol[]>('/clinic/protocols'),
        api.get<Patient[]>('/clinic/patients'),
      ]);
      setProtocols(pr); setPatients(p);
    } catch { showToast?.('Erro ao carregar planos de tratamento', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!protocolModal || products.length) return;
    api.get<ProductLite[]>('/products').then(setProducts).catch(() => {});
  }, [protocolModal, products.length]);

  const openProtocolModal = () => {
    setProtocolForm({ patientId: '', area: AREAS[3].id, title: '', startDate: '', endDate: '', notes: '' });
    setProtocolItems([{ productId: '', dosageText: '', frequencyText: '', quantityPerDispense: 1 }]);
    setProtocolModal(true);
  };

  const createProtocol = async () => {
    if (!protocolForm.patientId || !protocolForm.title) return;
    setSaving(true);
    try {
      const items = protocolItems.filter(i => i.productId);
      await api.post('/clinic/protocols', { ...protocolForm, items });
      showToast?.('Plano de tratamento criado' + (items.length ? ' e stock atualizado' : ''), 'success');
      setProtocolModal(false);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao criar plano de tratamento', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <PageShell title="Planos de Tratamento" description="Planos de tratamento com fitoterapia e suplementação"
      actions={
        <button onClick={openProtocolModal}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      }>
      <div className="bg-surface-raised rounded-2xl border border-border-default p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
        ) : (
          <div className="space-y-2">
            {protocols.map(p => {
              const patient = patients.find(pt => pt.id === p.patientId);
              return (
                <div key={p.id} className="border border-border-default rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-content-primary">{p.title}</span>
                        <AreaBadge area={p.area} />
                      </div>
                      <p className="text-xs text-content-muted mt-0.5">
                        {patient?.customerName || '—'} · desde {new Date(p.startDate).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${PROTOCOL_STATUS_COLORS[p.status]}`}>
                      {PROTOCOL_STATUS_LABELS[p.status]}
                    </span>
                  </div>
                </div>
              );
            })}
            {protocols.length === 0 && <p className="text-center py-12 text-content-muted">Nenhum plano de tratamento criado</p>}
          </div>
        )}
      </div>

      {protocolModal && (
        <Modal title="Novo Plano de Tratamento" onClose={() => setProtocolModal(false)} wide>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Paciente *</label>
              <select value={protocolForm.patientId} onChange={e => setProtocolForm(p => ({ ...p, patientId: e.target.value }))} className={inputCls}>
                <option value="">Selecionar…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.customerName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Área *</label>
                <select value={protocolForm.area} onChange={e => setProtocolForm(p => ({ ...p, area: e.target.value }))} className={inputCls}>
                  {AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Título *</label>
                <input value={protocolForm.title} onChange={e => setProtocolForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Suporte Imunitário — Fase 1" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data Início</label>
                <input type="date" value={protocolForm.startDate} onChange={e => setProtocolForm(p => ({ ...p, startDate: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data Fim (opcional)</label>
                <input type="date" value={protocolForm.endDate} onChange={e => setProtocolForm(p => ({ ...p, endDate: e.target.value }))} className={inputCls} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>Suplementos / Fitoterapia</label>
                <button onClick={() => setProtocolItems(items => [...items, { productId: '', dosageText: '', frequencyText: '', quantityPerDispense: 1 }])}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar produto
                </button>
              </div>
              <div className="space-y-2">
                {protocolItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-start border border-border-default rounded-lg p-2">
                    <select value={item.productId} onChange={e => setProtocolItems(items => items.map((it, i) => i === idx ? { ...it, productId: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-4'}>
                      <option value="">Produto…</option>
                      {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name} (stock: {pr.stock})</option>)}
                    </select>
                    <input placeholder="Dosagem" value={item.dosageText} onChange={e => setProtocolItems(items => items.map((it, i) => i === idx ? { ...it, dosageText: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-3'} />
                    <input placeholder="Frequência" value={item.frequencyText} onChange={e => setProtocolItems(items => items.map((it, i) => i === idx ? { ...it, frequencyText: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-3'} />
                    <input type="number" min="1" placeholder="Qtd" value={item.quantityPerDispense} onChange={e => setProtocolItems(items => items.map((it, i) => i === idx ? { ...it, quantityPerDispense: Number(e.target.value) || 1 } : it))}
                      className={inputCls + ' sm:col-span-1'} />
                    <button onClick={() => setProtocolItems(items => items.filter((_, i) => i !== idx))} className="sm:col-span-1 flex items-center justify-center gap-2 text-content-muted hover:text-red-600 py-2">
                      <Trash2 className="w-4 h-4" /><span className="sm:hidden text-xs">Remover produto</span>
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-content-muted mt-2">O stock dos produtos selecionados é debitado automaticamente ao guardar.</p>
            </div>

            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={protocolForm.notes} onChange={e => setProtocolForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setProtocolModal(false)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={createProtocol} disabled={saving || !protocolForm.patientId || !protocolForm.title}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Criar Plano
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

export default ClinicProtocols;
