import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PageShell } from '../../core/components/layout/PageShell';
import api, { downloadBlob } from '../../core/services/apiClient';
import { useConfirm } from '../../core/contexts/ConfirmContext';
import {
  Target, Plus, X, Loader2, Trash2, Pencil, Download, Users, Award,
  ToggleLeft, ToggleRight, TrendingUp, Calendar,
} from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type GoalType = 'unit_threshold' | 'promoter_target';
type Goal = {
  id: string; name: string; type: GoalType;
  productId?: string | null; productName?: string | null; everyNUnits?: number | null;
  targetValue?: number | null; baseAmount?: number | null; fullAmount?: number | null;
  employeeIds: number[]; isActive: boolean; notes?: string | null; createdAt: string;
};
type EmployeeLite = { id: number; full_name: string; job_title: string; status: string };
type ProductLite = { id: string; name: string };
type GoalResult = {
  goalId: string; goalName: string; type: GoalType; productName?: string | null;
  unitsSold?: number; everyNUnits?: number; bonusUnits?: number;
  salesValue?: number; targetValue?: number; achieved?: boolean; baseAmount?: number; fullAmount?: number;
  bonusValue: number;
};
type EmployeeReport = { employeeId: number; employeeName: string; jobTitle?: string; goals: GoalResult[]; totalBonus: number };
type Report = { from: string; to: string; employees: EmployeeReport[]; grandTotal: number };

const TAB = { GOALS: 'goals', REPORT: 'report' } as const;
type Tab = typeof TAB[keyof typeof TAB];

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

const firstDayOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_GOAL_FORM = {
  name: '', type: 'unit_threshold' as GoalType,
  productId: '', everyNUnits: '4',
  targetValue: '', baseAmount: '', fullAmount: '',
  employeeIds: [] as number[], notes: '',
};

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4">
      <div className={`bg-surface-raised rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} animate-modal-enter`}>
        <div className="flex items-center justify-between p-5 border-b border-border-default">
          <h3 className="font-semibold text-content-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function KpiCard({ label, value, sub, icon, accent }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-surface-raised border border-border-default rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-content-muted uppercase tracking-wide">{label}</span>
        <span className={`p-2 rounded-lg ${accent}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-content-primary">{value}</p>
      {sub && <span className="text-xs text-content-muted">{sub}</span>}
    </div>
  );
}

const fmtMT = (n: number) => `${n.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

export function StaffIncentives({ showToast }: Props) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(TAB.GOALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  const [goalModal, setGoalModal] = useState<null | 'new' | Goal>(null);
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL_FORM);

  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Report | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, e, p] = await Promise.all([
        api.get<Goal[]>('/incentives/goals'),
        api.get<EmployeeLite[]>('/hr/employees?status=active'),
        api.get<ProductLite[]>('/products'),
      ]);
      setGoals(g); setEmployees(e); setProducts(p);
    } catch { showToast?.('Erro ao carregar metas', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openNewGoal = () => { setGoalForm(EMPTY_GOAL_FORM); setGoalModal('new'); };
  const openEditGoal = (g: Goal) => {
    setGoalForm({
      name: g.name, type: g.type,
      productId: g.productId || '', everyNUnits: String(g.everyNUnits || 4),
      targetValue: g.targetValue != null ? String(g.targetValue) : '',
      baseAmount: g.baseAmount != null ? String(g.baseAmount) : '',
      fullAmount: g.fullAmount != null ? String(g.fullAmount) : '',
      employeeIds: g.employeeIds || [], notes: g.notes || '',
    });
    setGoalModal(g);
  };

  const saveGoal = async () => {
    if (!goalForm.name.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        name: goalForm.name.trim(), type: goalForm.type,
        employeeIds: goalForm.employeeIds, notes: goalForm.notes || undefined,
      };
      if (goalForm.type === 'unit_threshold') {
        payload.productId = goalForm.productId || null;
        payload.everyNUnits = Number(goalForm.everyNUnits) || 1;
      } else {
        payload.productId = goalForm.productId || null;
        payload.targetValue = Number(goalForm.targetValue) || 0;
        payload.baseAmount = Number(goalForm.baseAmount) || 0;
        payload.fullAmount = Number(goalForm.fullAmount) || 0;
      }
      if (goalModal === 'new') {
        await api.post('/incentives/goals', payload);
        showToast?.('Meta criada', 'success');
      } else if (goalModal) {
        await api.put(`/incentives/goals/${goalModal.id}`, payload);
        showToast?.('Meta atualizada', 'success');
      }
      setGoalModal(null);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao guardar meta', 'error'); }
    finally { setSaving(false); }
  };

  const toggleGoalActive = async (g: Goal) => {
    try {
      await api.put(`/incentives/goals/${g.id}`, { isActive: !g.isActive });
      load();
    } catch { showToast?.('Erro ao atualizar meta', 'error'); }
  };

  const deleteGoal = async (g: Goal) => {
    const ok = await confirm(`Apagar a meta "${g.name}"? Esta ação não pode ser revertida.`, { title: 'Apagar Meta', confirmLabel: 'Apagar', variant: 'danger' });
    if (!ok) return;
    try {
      await api.delete(`/incentives/goals/${g.id}`);
      showToast?.('Meta apagada', 'success');
      load();
    } catch { showToast?.('Erro ao apagar meta', 'error'); }
  };

  const generateReport = async () => {
    setLoadingReport(true);
    try {
      const data = await api.get<Report>(`/incentives/report?from=${from}&to=${to}`);
      setReport(data);
    } catch (e: any) { showToast?.(e.message || 'Erro ao gerar relatório', 'error'); }
    finally { setLoadingReport(false); }
  };

  useEffect(() => { generateReport(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const downloadReportPdf = async () => {
    setDownloadingReport(true);
    try {
      await downloadBlob(`/pdf/incentives-report?from=${from}&to=${to}`, `metas-bonus-${from}-a-${to}.pdf`);
    } catch (e: any) { showToast?.(e.message || 'Erro ao gerar PDF', 'error'); }
    finally { setDownloadingReport(false); }
  };

  const goalSummary = (g: Goal) => g.type === 'unit_threshold'
    ? `${g.productName || 'Produto'} — a cada ${g.everyNUnits} vendidas, 1 é bónus`
    : `Meta de ${fmtMT(g.targetValue || 0)}${g.productName ? ` (${g.productName})` : ''} — base ${fmtMT(g.baseAmount || 0)} → completo ${fmtMT(g.fullAmount || 0)}`;

  return (
    <PageShell title="Metas & Bónus" description="Metas de vendas e bónus para o staff interno do caixa"
      actions={
        tab === TAB.GOALS ? (
          <button onClick={openNewGoal}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Nova Meta
          </button>
        ) : null
      }>
      <div className="bg-surface-raised rounded-2xl border border-border-default overflow-hidden">
        <div className="flex border-b border-border-default overflow-x-auto">
          {[
            { id: TAB.GOALS, label: 'Metas', icon: Target },
            { id: TAB.REPORT, label: 'Relatório de Bónus', icon: Award },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' : 'border-transparent text-content-muted hover:text-content-primary'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === TAB.GOALS ? (
            loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
            ) : (
              <div className="space-y-2">
                {goals.map(g => (
                  <div key={g.id} className="border border-border-default rounded-xl p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-content-primary">{g.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.type === 'unit_threshold' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                          {g.type === 'unit_threshold' ? 'Staff' : 'Promotor'}
                        </span>
                        {!g.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Inativa</span>}
                      </div>
                      <p className="text-xs text-content-muted mt-1">{goalSummary(g)}</p>
                      <p className="text-xs text-content-muted mt-0.5">
                        {g.employeeIds?.length ? `${g.employeeIds.length} funcionário(s) específico(s)` : 'Aplica-se a todo o staff interno'}
                      </p>
                    </div>
                    <button onClick={() => toggleGoalActive(g)} title={g.isActive ? 'Desativar' : 'Ativar'} className="shrink-0 text-content-muted hover:text-brand-600">
                      {g.isActive ? <ToggleRight className="w-6 h-6 text-brand-600" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                    <button onClick={() => openEditGoal(g)} title="Editar" className="shrink-0 p-1.5 rounded-lg text-content-muted hover:bg-surface-overlay">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteGoal(g)} title="Apagar" className="shrink-0 p-1.5 rounded-lg text-content-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {goals.length === 0 && <p className="text-center py-12 text-content-muted">Nenhuma meta criada. Crie uma meta para o staff ou para os promotores.</p>}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className={labelCls}>De</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Até</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                </div>
                <button onClick={generateReport} disabled={loadingReport}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {loadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Gerar
                </button>
                {report && (
                  <button onClick={downloadReportPdf} disabled={downloadingReport}
                    className="flex items-center gap-2 px-4 py-2 border border-border-default rounded-lg text-sm font-medium text-content-secondary hover:bg-surface-overlay disabled:opacity-50">
                    {downloadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Baixar PDF
                  </button>
                )}
              </div>

              {loadingReport ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
              ) : report ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <KpiCard label="Total de Bónus" value={fmtMT(report.grandTotal)} sub={`${report.from} — ${report.to}`}
                      icon={<Award className="w-4 h-4 text-brand-600" />} accent="bg-brand-50 dark:bg-brand-900/20" />
                    <KpiCard label="Funcionários com Bónus" value={report.employees.length} sub="no período"
                      icon={<Users className="w-4 h-4 text-blue-600" />} accent="bg-blue-50 dark:bg-blue-900/20" />
                    <KpiCard label="Metas Ativas" value={goals.filter(g => g.isActive).length} sub="a contar neste relatório"
                      icon={<TrendingUp className="w-4 h-4 text-purple-600" />} accent="bg-purple-50 dark:bg-purple-900/20" />
                  </div>

                  <div className="space-y-2">
                    {report.employees.map(emp => (
                      <div key={emp.employeeId} className="border border-border-default rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-content-primary">{emp.employeeName}</p>
                            {emp.jobTitle && <p className="text-xs text-content-muted">{emp.jobTitle}</p>}
                          </div>
                          <span className="font-semibold text-brand-600 dark:text-brand-400">{fmtMT(emp.totalBonus)}</span>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          {emp.goals.map(g => (
                            <div key={g.goalId} className="flex items-center justify-between gap-2 text-xs bg-surface-overlay/40 rounded-lg px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-content-secondary font-medium truncate">{g.goalName}</p>
                                <p className="text-content-muted">
                                  {g.type === 'unit_threshold'
                                    ? `${g.productName || 'Produto'} — ${g.unitsSold} vendidas (a cada ${g.everyNUnits}) = ${g.bonusUnits} bónus`
                                    : `${g.salesValue?.toFixed(2)} / ${g.targetValue?.toFixed(2)} MT — ${g.achieved ? 'meta atingida' : 'meta não atingida'}`}
                                </p>
                              </div>
                              <span className={`shrink-0 font-medium ${g.bonusValue > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-content-muted'}`}>{fmtMT(g.bonusValue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {report.employees.length === 0 && (
                      <p className="text-center py-12 text-content-muted">Nenhum funcionário atingiu ou tem metas aplicáveis neste período.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nova/Editar Meta */}
      {goalModal && (
        <Modal title={goalModal === 'new' ? 'Nova Meta' : 'Editar Meta'} onClose={() => setGoalModal(null)} wide>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome da meta *</label>
              <input value={goalForm.name} onChange={e => setGoalForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Chá Verde 500ml — bónus a cada 4 vendas" className={inputCls} />
            </div>

            <div className="flex border border-border-default rounded-lg p-1 bg-surface-base">
              <button onClick={() => setGoalForm(p => ({ ...p, type: 'unit_threshold' }))}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${goalForm.type === 'unit_threshold' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}>
                Staff — a cada N unidades
              </button>
              <button onClick={() => setGoalForm(p => ({ ...p, type: 'promoter_target' }))}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${goalForm.type === 'promoter_target' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}>
                Promotor — meta de valor
              </button>
            </div>

            {goalForm.type === 'unit_threshold' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Produto *</label>
                  <select value={goalForm.productId} onChange={e => setGoalForm(p => ({ ...p, productId: e.target.value }))} className={inputCls}>
                    <option value="">Selecionar produto…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>A cada quantas unidades vendidas</label>
                  <input type="number" min="1" value={goalForm.everyNUnits} onChange={e => setGoalForm(p => ({ ...p, everyNUnits: e.target.value }))} className={inputCls} />
                </div>
                <p className="col-span-2 text-xs text-content-muted">
                  Ex: com "4", a cada 4 unidades vendidas pelo funcionário, o valor de 1 unidade (a última) vira bónus.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Produto (opcional)</label>
                  <select value={goalForm.productId} onChange={e => setGoalForm(p => ({ ...p, productId: e.target.value }))} className={inputCls}>
                    <option value="">Todos os produtos vendidos pelo promotor</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Meta de vendas (MT) *</label>
                  <input type="number" min="0" step="0.01" value={goalForm.targetValue} onChange={e => setGoalForm(p => ({ ...p, targetValue: e.target.value }))} className={inputCls} />
                </div>
                <div />
                <div>
                  <label className={labelCls}>Salário base (MT) *</label>
                  <input type="number" min="0" step="0.01" value={goalForm.baseAmount} onChange={e => setGoalForm(p => ({ ...p, baseAmount: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Salário completo (MT) *</label>
                  <input type="number" min="0" step="0.01" value={goalForm.fullAmount} onChange={e => setGoalForm(p => ({ ...p, fullAmount: e.target.value }))} className={inputCls} />
                </div>
                <p className="col-span-2 text-xs text-content-muted">
                  Se atingir a meta de vendas no período, o bónus será a diferença entre o salário completo e o base. Se não atingir, o bónus é 0 (o funcionário recebe apenas o base, já refletido no seu salário em RH).
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>Funcionários abrangidos</label>
                <button onClick={() => setGoalForm(p => ({ ...p, employeeIds: [] }))} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  Limpar (aplicar a todos)
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-border-default rounded-lg divide-y divide-border-default">
                {employees.map(emp => {
                  const checked = goalForm.employeeIds.includes(emp.id);
                  return (
                    <label key={emp.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface-overlay">
                      <input type="checkbox" checked={checked}
                        onChange={() => setGoalForm(p => ({
                          ...p,
                          employeeIds: checked ? p.employeeIds.filter(id => id !== emp.id) : [...p.employeeIds, emp.id],
                        }))} />
                      <span className="text-content-primary">{emp.full_name}</span>
                      <span className="text-content-muted text-xs">{emp.job_title}</span>
                    </label>
                  );
                })}
                {employees.length === 0 && <p className="px-3 py-4 text-xs text-content-muted text-center">Nenhum funcionário ativo</p>}
              </div>
              <p className="text-xs text-content-muted mt-1">Vazio = aplica-se a todo o staff interno.</p>
            </div>

            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={goalForm.notes} onChange={e => setGoalForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls} />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setGoalModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveGoal} disabled={saving || !goalForm.name.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

export default StaffIncentives;
