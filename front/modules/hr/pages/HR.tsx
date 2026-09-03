import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PageShell } from '../../core/components/layout/PageShell';
import api, { downloadBlob } from '../../core/services/apiClient';
import {
  Users, Building2, FileText, Calendar, Plus, Pencil, Trash2,
  Loader2, Search, X, ChevronDown, Check, UserCheck, UserX, Clock,
  DollarSign, Play, CheckCheck, ChevronRight, AlertCircle, Printer, Download,
} from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';
import { useConfirm } from '../../core/contexts/ConfirmContext';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

type Employee = {
  id: number; full_name: string; job_title: string; department_name: string;
  department_id: number; hire_date: string; contract_type: string;
  salary: number; phone: string; email: string; status: string; avatar_url: string;
  inss_exempt: boolean; irps_exempt: boolean; inss_rate: number | null; irps_rate: number | null;
  payment_method: string; bank_name: string | null; bank_nib: string | null;
  bank_account: string | null; mpesa_number: string | null; emola_number: string | null;
};
type Department = { id: number; name: string; description: string; manager_name: string; employee_count: number; };
type Leave = {
  id: number; employee_name: string; type: string; start_date: string;
  end_date: string; days: number; reason: string; status: string;
};
type Stats = { total: number; active: number; on_leave: number; departments: number; pending_leaves: number; };
type TimeEntry = { id: number; employee_name: string; project_name: string; task_title: string; date: string; hours: number; description: string; billable: boolean; };
type Project = { id: number; name: string; };

const TAB = { EMPLOYEES: 'employees', DEPARTMENTS: 'departments', LEAVES: 'leaves', PAYROLL: 'payroll', TIMESHEETS: 'timesheets' } as const;
type Tab = typeof TAB[keyof typeof TAB];

type PayrollPeriod = {
  id: number; period_name: string; start_date: string; end_date: string;
  status: string; notes: string; slip_count: number; total_gross: number; total_net: number;
};
type Payslip = {
  id: number; employee_id: number; full_name: string; job_title: string;
  department_name: string; gross_salary: number; inss_employee: number;
  inss_employer: number; irps: number; other_deductions: number; other_additions: number;
  net_salary: number; status: string; notes: string;
};

const CONTRACT_LABELS: Record<string, string> = {
  full_time: 'Tempo Inteiro', part_time: 'Meio Período',
  intern: 'Estagiário', contractor: 'Prestador',
};
const LEAVE_TYPES: Record<string, string> = {
  annual: 'Férias', sick: 'Doença', maternity: 'Maternidade', unpaid: 'Sem Vencimento', other: 'Outro',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  on_leave: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

const EMPTY_EMP_FORM = {
  full_name: '', job_title: '', department_id: '', hire_date: '', contract_type: 'full_time',
  salary: '', phone: '', email: '', status: 'active', notes: '',
  inss_exempt: false, irps_exempt: false, inss_rate: '', irps_rate: '',
  payment_method: 'bank', bank_name: '', bank_nib: '', bank_account: '', mpesa_number: '', emola_number: '',
};

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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4">
      <div className="bg-surface-raised rounded-2xl shadow-xl w-full max-w-lg animate-modal-enter">
        <div className="flex items-center justify-between p-5 border-b border-border-default">
          <h3 className="font-semibold text-content-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function HR({ showToast }: Props) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(TAB.EMPLOYEES);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<'employee' | 'department' | 'leave' | 'timesheet' | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [empForm, setEmpForm] = useState({ ...EMPTY_EMP_FORM });
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', type: 'annual', start_date: '', end_date: '', days: '1', reason: '' });

  // Timesheets state
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [tsProjects, setTsProjects] = useState<Project[]>([]);
  const [tsForm, setTsForm] = useState({ employee_id: '', project_id: '', date: new Date().toISOString().slice(0,10), hours: '', description: '', billable: false });

  // Payroll state
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [processingPayroll, setProcessingPayroll] = useState(false);
  const [periodModal, setPeriodModal] = useState(false);
  const [editingSlip, setEditingSlip] = useState<Payslip | null>(null);
  const [slipModal, setSlipModal] = useState(false);
  const [printingSlipId, setPrintingSlipId] = useState<number | null>(null);
  const [downloadingSheet, setDownloadingSheet] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState({ period_name: '', start_date: '', end_date: '', notes: '' });
  const [slipForm, setSlipForm] = useState({ gross_salary: '', inss_employee: '', inss_employer: '', irps: '', other_deductions: '0', other_additions: '0', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, d, l, s, pp, te, tp] = await Promise.all([
        api.get<Employee[]>('/hr/employees'),
        api.get<Department[]>('/hr/departments'),
        api.get<Leave[]>('/hr/leaves'),
        api.get<Stats>('/hr/stats'),
        api.get<PayrollPeriod[]>('/hr/payroll'),
        api.get<TimeEntry[]>('/projects/timesheets'),
        api.get<Project[]>('/projects'),
      ]);
      setEmployees(e); setDepartments(d); setLeaves(l); setStats(s); setPeriods(pp);
      setTimeEntries(te); setTsProjects(tp);
    } catch { showToast?.('Erro ao carregar dados', 'error'); }
    finally { setLoading(false); }
  }, []);

  const saveTimesheet = async () => {
    setSaving(true);
    try {
      await api.post('/projects/timesheets', tsForm);
      showToast?.('Registo guardado', 'success'); setModal(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const deleteTimesheet = async (id: number) => {
    if (!(await confirm('Eliminar registo de horas?', { variant: 'danger', confirmLabel: 'Eliminar' }))) return;
    try { await api.delete(`/projects/timesheets/${id}`); showToast?.('Eliminado', 'success'); load(); }
    catch { showToast?.('Erro', 'error'); }
  };

  const loadPayslips = useCallback(async (periodId: number) => {
    setLoadingPayslips(true);
    try {
      const data = await api.get<Payslip[]>(`/hr/payroll/${periodId}/payslips`);
      setPayslips(data);
    } catch { showToast?.('Erro ao carregar recibos', 'error'); }
    finally { setLoadingPayslips(false); }
  }, []);

  const createPeriod = async () => {
    setSaving(true);
    try {
      await api.post('/hr/payroll', periodForm);
      showToast?.('Período criado', 'success'); setPeriodModal(false); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const processPeriod = async (id: number) => {
    if (!(await confirm('Os valores serão calculados automaticamente para todos os funcionários activos.', { title: 'Processar folha de salários?', confirmLabel: 'Processar' }))) return;
    setProcessingPayroll(true);
    try {
      const res = await api.post<{ processed: number }>(`/hr/payroll/${id}/process`, {});
      showToast?.(`${res.processed} recibos gerados`, 'success');
      await loadPayslips(id);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setProcessingPayroll(false); }
  };

  const closePeriod = async (id: number) => {
    if (!(await confirm('Esta ação não pode ser revertida.', { title: 'Fechar período?', variant: 'danger', confirmLabel: 'Fechar' }))) return;
    try {
      await api.put(`/hr/payroll/${id}/close`, {});
      showToast?.('Período fechado', 'success'); load();
      if (selectedPeriod?.id === id) setSelectedPeriod(prev => prev ? { ...prev, status: 'closed' } : null);
    } catch { showToast?.('Erro', 'error'); }
  };

  const openSlipEdit = (slip: Payslip) => {
    setEditingSlip(slip);
    setSlipForm({
      gross_salary: String(slip.gross_salary),
      inss_employee: String(slip.inss_employee),
      inss_employer: String(slip.inss_employer),
      irps: String(slip.irps),
      other_deductions: String(slip.other_deductions || 0),
      other_additions: String(slip.other_additions || 0),
      notes: slip.notes || '',
    });
    setSlipModal(true);
  };

  const saveSlip = async () => {
    if (!editingSlip) return;
    setSaving(true);
    try {
      await api.put(`/hr/payroll/payslips/${editingSlip.id}`, slipForm);
      showToast?.('Recibo actualizado', 'success');
      setSlipModal(false); setEditingSlip(null);
      if (selectedPeriod) loadPayslips(selectedPeriod.id);
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const printSlip = async (slip: Payslip) => {
    setPrintingSlipId(slip.id);
    try {
      await downloadBlob(`/pdf/payroll-slip/${slip.id}`, `recibo-vencimento-${slip.full_name.replace(/\s+/g, '-')}.pdf`);
    } catch (e: any) { showToast?.(e.message || 'Erro ao gerar recibo', 'error'); }
    finally { setPrintingSlipId(null); }
  };

  const downloadSheet = async (type: 'inss' | 'irps' | 'salarios', period?: PayrollPeriod) => {
    const p = period || selectedPeriod;
    if (!p) return;
    const route = type === 'salarios' ? 'payroll-sheet' : `payroll-${type}`;
    const key = `${type}-${p.id}`;
    setDownloadingSheet(key);
    try {
      const slug = (p.period_name || String(p.id)).replace(/\s+/g, '-');
      await downloadBlob(`/pdf/${route}/${p.id}`, `folha-${type}-${slug}.pdf`);
    } catch (e: any) { showToast?.(e.message || 'Erro ao gerar folha', 'error'); }
    finally { setDownloadingSheet(null); }
  };

  const deletePeriod = async (period: PayrollPeriod) => {
    if (!(await confirm(`Todos os ${period.slip_count || 0} recibos deste período serão eliminados. Esta ação não pode ser revertida.`, { title: `Apagar o período "${period.period_name}"?`, variant: 'danger', confirmLabel: 'Apagar' }))) return;
    try {
      await api.delete(`/hr/payroll/${period.id}`);
      showToast?.('Período eliminado', 'success');
      if (selectedPeriod?.id === period.id) { setSelectedPeriod(null); setPayslips([]); }
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao eliminar período', 'error'); }
  };

  const markPaid = async (slipId: number) => {
    try {
      await api.put(`/hr/payroll/payslips/${slipId}/pay`, {});
      showToast?.('Marcado como pago', 'success');
      if (selectedPeriod) loadPayslips(selectedPeriod.id);
    } catch { showToast?.('Erro', 'error'); }
  };

  useEffect(() => { load(); }, [load]);

  const openEdit = (type: 'employee' | 'department' | 'leave', item: any) => {
    setEditing(item);
    if (type === 'employee') setEmpForm({
      full_name: item.full_name, job_title: item.job_title||'', department_id: item.department_id||'',
      hire_date: item.hire_date?.slice(0,10)||'', contract_type: item.contract_type||'full_time',
      salary: item.salary||'', phone: item.phone||'', email: item.email||'', status: item.status||'active',
      notes: item.notes||'', inss_exempt: !!item.inss_exempt, irps_exempt: !!item.irps_exempt,
      inss_rate: item.inss_rate ?? '', irps_rate: item.irps_rate ?? '',
      payment_method: item.payment_method || 'bank', bank_name: item.bank_name || '',
      bank_nib: item.bank_nib || '', bank_account: item.bank_account || '',
      mpesa_number: item.mpesa_number || '', emola_number: item.emola_number || '',
    });
    if (type === 'department') setDeptForm({ name: item.name, description: item.description||'' });
    setModal(type);
  };

  const saveEmployee = async () => {
    setSaving(true);
    try {
      if (editing) await api.put(`/hr/employees/${editing.id}`, empForm);
      else await api.post('/hr/employees', empForm);
      showToast?.('Guardado', 'success'); setModal(null); setEditing(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const saveDept = async () => {
    setSaving(true);
    try {
      if (editing) await api.put(`/hr/departments/${editing.id}`, deptForm);
      else await api.post('/hr/departments', deptForm);
      showToast?.('Guardado', 'success'); setModal(null); setEditing(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const saveLeave = async () => {
    setSaving(true);
    try {
      await api.post('/hr/leaves', leaveForm);
      showToast?.('Pedido enviado', 'success'); setModal(null); load();
    } catch (e: any) { showToast?.(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  };

  const updateLeaveStatus = async (id: number, status: string) => {
    try {
      await api.put(`/hr/leaves/${id}/status`, { status });
      showToast?.(status === 'approved' ? 'Aprovado' : 'Rejeitado', 'success'); load();
    } catch { showToast?.('Erro', 'error'); }
  };

  const deleteEmployee = async (id: number) => {
    if (!(await confirm('Eliminar funcionário?', { variant: 'danger', confirmLabel: 'Eliminar' }))) return;
    try { await api.delete(`/hr/employees/${id}`); showToast?.('Eliminado', 'success'); load(); }
    catch { showToast?.('Erro', 'error'); }
  };

  const filteredEmployees = employees.filter(e =>
    !q || e.full_name.toLowerCase().includes(q.toLowerCase()) ||
    (e.email||'').toLowerCase().includes(q.toLowerCase())
  );

  const tabs = [
    { id: TAB.EMPLOYEES, label: 'Funcionários', icon: Users },
    { id: TAB.DEPARTMENTS, label: 'Departamentos', icon: Building2 },
    { id: TAB.LEAVES, label: 'Ausências', icon: Calendar },
    { id: TAB.PAYROLL, label: 'Salários', icon: DollarSign },
    { id: TAB.TIMESHEETS, label: 'Horas', icon: Clock },
  ];

  const totalHours = timeEntries.reduce((s, e) => s + Number(e.hours), 0);
  const billableHours = timeEntries.filter(e => e.billable).reduce((s, e) => s + Number(e.hours), 0);

  return (
    <PageShell title="Recursos Humanos" description="Gestão de funcionários, departamentos, ausências, salários e horas"
      actions={
        tab === TAB.PAYROLL ? (
          <button onClick={() => { setPeriodForm({ period_name: '', start_date: '', end_date: '', notes: '' }); setPeriodModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo Período
          </button>
        ) : tab === TAB.TIMESHEETS ? (
          <button onClick={() => { setTsForm({ employee_id: '', project_id: '', date: new Date().toISOString().slice(0,10), hours: '', description: '', billable: false }); setModal('timesheet'); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo Registo
          </button>
        ) : (
          <button onClick={() => { setEditing(null); setEmpForm({ ...EMPTY_EMP_FORM }); setModal(tab === TAB.DEPARTMENTS ? 'department' : tab === TAB.LEAVES ? 'leave' : 'employee'); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            {tab === TAB.DEPARTMENTS ? 'Novo Departamento' : tab === TAB.LEAVES ? 'Pedir Ausência' : 'Novo Funcionário'}
          </button>
        )
      }>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Total" value={stats.total} sub="funcionários registados"
            icon={<Users className="w-4 h-4 text-blue-600" />} accent="bg-blue-50 dark:bg-blue-900/20" />
          <KpiCard label="Activos" value={stats.active} sub="em funções"
            icon={<UserCheck className="w-4 h-4 text-green-600" />} accent="bg-green-50 dark:bg-green-900/20" />
          <KpiCard label="Ausentes" value={stats.on_leave} sub="de férias ou licença"
            icon={<UserX className="w-4 h-4 text-yellow-600" />} accent="bg-yellow-50 dark:bg-yellow-900/20" />
          <KpiCard label="Departamentos" value={stats.departments} sub="unidades organizacionais"
            icon={<Building2 className="w-4 h-4 text-purple-600" />} accent="bg-purple-50 dark:bg-purple-900/20" />
          <KpiCard label="Pedidos Pendentes" value={stats.pending_leaves} sub="ausências por aprovar"
            icon={<Clock className="w-4 h-4 text-orange-600" />} accent="bg-orange-50 dark:bg-orange-900/20" />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface-raised rounded-2xl border border-border-default overflow-hidden">
        <div className="flex border-b border-border-default overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400' : 'border-transparent text-content-muted hover:text-content-primary'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
          ) : tab === TAB.EMPLOYEES ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar funcionário…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border-default rounded-lg bg-surface-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border-default">
                    {['Nome', 'Cargo', 'Departamento', 'Tipo', 'Salário', 'Estado', ''].map(h => (
                      <th key={h} className="text-left py-3 px-3 text-xs font-medium text-content-muted">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="border-b border-border-default/50 hover:bg-surface-overlay/50">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-xs font-bold shrink-0">
                              {emp.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-content-primary">{emp.full_name}</p>
                              <p className="text-xs text-content-muted">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-content-secondary">{emp.job_title || '—'}</td>
                        <td className="py-3 px-3 text-content-secondary">{emp.department_name || '—'}</td>
                        <td className="py-3 px-3 text-content-secondary">{CONTRACT_LABELS[emp.contract_type] || emp.contract_type}</td>
                        <td className="py-3 px-3 text-content-secondary">MT {Number(emp.salary||0).toFixed(2)}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[emp.status]}`}>
                            {emp.status === 'active' ? 'Activo' : emp.status === 'on_leave' ? 'Ausente' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit('employee', emp)} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted hover:text-content-primary"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => deleteEmployee(emp.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-content-muted hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <tr><td colSpan={7} className="py-12 text-center text-content-muted">Nenhum funcionário encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : tab === TAB.DEPARTMENTS ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map(d => (
                <div key={d.id} className="border border-border-default rounded-xl p-4 hover:bg-surface-overlay/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-content-primary">{d.name}</p>
                      {d.description && <p className="text-xs text-content-muted mt-0.5">{d.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit('department', d)} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border-default flex items-center gap-4 text-xs text-content-muted">
                    <span><span className="font-medium text-content-primary">{d.employee_count}</span> funcionários</span>
                    {d.manager_name && <span>Gestor: <span className="text-content-secondary">{d.manager_name}</span></span>}
                  </div>
                </div>
              ))}
              {departments.length === 0 && (
                <p className="col-span-3 text-center py-12 text-content-muted">Nenhum departamento criado</p>
              )}
            </div>
          ) : tab === TAB.PAYROLL ? (
            /* ── PAYROLL ──────────────────────────────────────────────────── */
            selectedPeriod ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedPeriod(null); setPayslips([]); }} className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </button>
                  <div>
                    <h3 className="font-semibold text-content-primary">{selectedPeriod.period_name}</h3>
                    <p className="text-xs text-content-muted">{selectedPeriod.start_date?.slice(0,10)} → {selectedPeriod.end_date?.slice(0,10)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {payslips.length > 0 && (
                      <>
                        <button onClick={() => downloadSheet('salarios')} disabled={downloadingSheet !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border-default text-content-secondary hover:bg-surface-overlay rounded-lg text-xs font-medium disabled:opacity-50"
                          title="Folha de salários com dados bancários — para enviar ao banco">
                          {downloadingSheet === `salarios-${selectedPeriod.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Folha Salários
                        </button>
                        <button onClick={() => downloadSheet('inss')} disabled={downloadingSheet !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border-default text-content-secondary hover:bg-surface-overlay rounded-lg text-xs font-medium disabled:opacity-50"
                          title="Descarregar folha de INSS do período">
                          {downloadingSheet === `inss-${selectedPeriod.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Folha INSS
                        </button>
                        <button onClick={() => downloadSheet('irps')} disabled={downloadingSheet !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border-default text-content-secondary hover:bg-surface-overlay rounded-lg text-xs font-medium disabled:opacity-50"
                          title="Descarregar folha de IRPS do período">
                          {downloadingSheet === `irps-${selectedPeriod.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Folha IRPS
                        </button>
                      </>
                    )}
                    {selectedPeriod.status !== 'closed' && (
                      <>
                        <button onClick={() => processPeriod(selectedPeriod.id)} disabled={processingPayroll}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                          {processingPayroll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          Processar
                        </button>
                        <button onClick={() => closePeriod(selectedPeriod.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border-default text-content-secondary hover:bg-surface-overlay rounded-lg text-xs font-medium">
                          <CheckCheck className="w-3.5 h-3.5" /> Fechar
                        </button>
                      </>
                    )}
                    {selectedPeriod.status === 'closed' && (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full font-medium">Fechado</span>
                    )}
                  </div>
                </div>

                {/* Resumo */}
                {payslips.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Bruto', value: payslips.reduce((s,p) => s + Number(p.gross_salary), 0) },
                      { label: 'Total INSS (Entidade)', value: payslips.reduce((s,p) => s + Number(p.inss_employer), 0) },
                      { label: 'Total Líquido', value: payslips.reduce((s,p) => s + Number(p.net_salary), 0) },
                    ].map(s => (
                      <div key={s.label} className="bg-surface-overlay rounded-xl p-3 text-center">
                        <p className="text-lg font-bold text-content-primary">MT {Number(s.value).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-content-muted">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {loadingPayslips ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-content-muted" /></div>
                ) : payslips.length === 0 ? (
                  <div className="text-center py-10 text-content-muted">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Clique em "Processar" para gerar os recibos de salário</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border-default">
                        {['Funcionário', 'Cargo', 'Bruto', 'INSS Func.', 'IRPS', 'Out. Deduções', 'Líquido', 'Estado', ''].map(h => (
                          <th key={h} className="text-left py-3 px-2 text-xs font-medium text-content-muted">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {payslips.map(slip => (
                          <tr key={slip.id} className="border-b border-border-default/50 hover:bg-surface-overlay/50">
                            <td className="py-2.5 px-2 font-medium text-content-primary">{slip.full_name}</td>
                            <td className="py-2.5 px-2 text-content-secondary text-xs">{slip.job_title || '—'}</td>
                            <td className="py-2.5 px-2 text-content-secondary">MT {Number(slip.gross_salary).toFixed(2)}</td>
                            <td className="py-2.5 px-2 text-red-600 text-xs">-MT {Number(slip.inss_employee).toFixed(2)}</td>
                            <td className="py-2.5 px-2 text-red-600 text-xs">-MT {Number(slip.irps).toFixed(2)}</td>
                            <td className="py-2.5 px-2 text-red-600 text-xs">-MT {Number(slip.other_deductions || 0).toFixed(2)}</td>
                            <td className="py-2.5 px-2 font-semibold text-green-700 dark:text-green-400">MT {Number(slip.net_salary).toFixed(2)}</td>
                            <td className="py-2.5 px-2">
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${slip.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                {slip.status === 'paid' ? 'Pago' : 'Pendente'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex gap-1">
                                <button onClick={() => printSlip(slip)} disabled={printingSlipId === slip.id}
                                  className="p-1 rounded hover:bg-surface-overlay text-content-muted hover:text-content-primary disabled:opacity-50" title="Imprimir / PDF">
                                  {printingSlipId === slip.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => openSlipEdit(slip)} className="p-1 rounded hover:bg-surface-overlay text-content-muted" title="Editar">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {slip.status !== 'paid' && selectedPeriod.status !== 'closed' && (
                                  <button onClick={() => markPaid(slip.id)} className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-content-muted hover:text-green-600" title="Marcar como pago">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* Lista de períodos */
              <div className="space-y-3">
                {periods.length === 0 && (
                  <p className="text-center py-12 text-content-muted">Nenhum período criado. Clique em "Novo Período" para começar.</p>
                )}
                {periods.map(pp => (
                  <div key={pp.id} className="flex items-center gap-4 border border-border-default rounded-xl p-4 hover:bg-surface-overlay/30 transition-colors cursor-pointer"
                    onClick={() => { setSelectedPeriod(pp); loadPayslips(pp.id); }}>
                    <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                      <DollarSign className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-content-primary">{pp.period_name}</p>
                      <p className="text-xs text-content-muted">{pp.start_date?.slice(0,10)} → {pp.end_date?.slice(0,10)} · {pp.slip_count} recibos</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-content-primary">MT {Number(pp.total_net || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-content-muted">líquido total</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                      pp.status === 'closed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : pp.status === 'processing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {pp.status === 'closed' ? 'Fechado' : pp.status === 'processing' ? 'Processado' : 'Rascunho'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(pp.slip_count || 0) > 0 && (
                        <button onClick={e => { e.stopPropagation(); downloadSheet('salarios', pp); }} disabled={downloadingSheet !== null}
                          className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted hover:text-content-primary disabled:opacity-50"
                          title="Descarregar folha de salários (dados bancários para pagamento)">
                          {downloadingSheet === `salarios-${pp.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); deletePeriod(pp); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-content-muted hover:text-red-600"
                        title="Apagar período">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
                  </div>
                ))}
              </div>
            )
          ) : tab === TAB.TIMESHEETS ? (
            /* ── TIMESHEETS ───────────────────────────────────────────────── */
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-overlay rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-content-primary">{totalHours.toFixed(1)}h</p>
                  <p className="text-xs text-content-muted">Total Horas</p>
                </div>
                <div className="bg-surface-overlay rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{billableHours.toFixed(1)}h</p>
                  <p className="text-xs text-content-muted">Horas Facturáveis</p>
                </div>
                <div className="bg-surface-overlay rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-brand-600">{timeEntries.length}</p>
                  <p className="text-xs text-content-muted">Registos</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border-default">
                    {['Data', 'Funcionário', 'Projecto', 'Tarefa', 'Horas', 'Descrição', 'Fac.', ''].map(h => (
                      <th key={h} className="text-left py-3 px-3 text-xs font-medium text-content-muted">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {timeEntries.map(e => (
                      <tr key={e.id} className="border-b border-border-default/50 hover:bg-surface-overlay/50">
                        <td className="py-3 px-3 text-content-secondary">{e.date?.slice(0,10)}</td>
                        <td className="py-3 px-3 font-medium text-content-primary">{e.employee_name || '—'}</td>
                        <td className="py-3 px-3 text-content-secondary">{e.project_name || '—'}</td>
                        <td className="py-3 px-3 text-content-secondary">{e.task_title || '—'}</td>
                        <td className="py-3 px-3 font-medium text-content-primary">{Number(e.hours).toFixed(1)}h</td>
                        <td className="py-3 px-3 text-content-secondary max-w-xs truncate">{e.description || '—'}</td>
                        <td className="py-3 px-3">{e.billable ? <span className="text-green-600 text-xs font-medium">Sim</span> : <span className="text-content-muted text-xs">Não</span>}</td>
                        <td className="py-3 px-3">
                          <button onClick={() => deleteTimesheet(e.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-content-muted hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                    {timeEntries.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-content-muted">Nenhum registo</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {leaves.map(l => (
                <div key={l.id} className="flex items-center gap-4 border border-border-default rounded-xl p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-content-primary">{l.employee_name}</span>
                      <span className="text-xs bg-surface-overlay px-2 py-0.5 rounded-full text-content-secondary">{LEAVE_TYPES[l.type]||l.type}</span>
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">{l.start_date?.slice(0,10)} → {l.end_date?.slice(0,10)} ({l.days} dias)</p>
                    {l.reason && <p className="text-xs text-content-secondary mt-1 truncate">{l.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[l.status]}`}>
                      {l.status === 'pending' ? 'Pendente' : l.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                    </span>
                    {l.status === 'pending' && (
                      <>
                        <button onClick={() => updateLeaveStatus(l.id, 'approved')} className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                        <button onClick={() => updateLeaveStatus(l.id, 'rejected')} className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100"><X className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {leaves.length === 0 && <p className="text-center py-12 text-content-muted">Nenhum pedido de ausência</p>}
            </div>
          )}
        </div>
      </div>

      {/* Modal Funcionário */}
      {modal === 'employee' && (
        <Modal title={editing ? 'Editar Funcionário' : 'Novo Funcionário'} onClose={() => { setModal(null); setEditing(null); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Nome Completo *</label>
                <input value={empForm.full_name} onChange={e => setEmpForm(p=>({...p,full_name:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cargo</label>
                <input value={empForm.job_title} onChange={e => setEmpForm(p=>({...p,job_title:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Departamento</label>
                <select value={empForm.department_id} onChange={e => setEmpForm(p=>({...p,department_id:e.target.value}))} className={inputCls}>
                  <option value="">Nenhum</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data de Admissão</label>
                <input type="date" value={empForm.hire_date} onChange={e => setEmpForm(p=>({...p,hire_date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tipo de Contrato</label>
                <select value={empForm.contract_type} onChange={e => setEmpForm(p=>({...p,contract_type:e.target.value}))} className={inputCls}>
                  {Object.entries(CONTRACT_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Salário (MT)</label>
                <input type="number" value={empForm.salary} onChange={e => setEmpForm(p=>({...p,salary:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Estado</label>
                <select value={empForm.status} onChange={e => setEmpForm(p=>({...p,status:e.target.value}))} className={inputCls}>
                  <option value="active">Activo</option>
                  <option value="on_leave">Ausente</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={empForm.phone} onChange={e => setEmpForm(p=>({...p,phone:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={empForm.email} onChange={e => setEmpForm(p=>({...p,email:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div className="border border-border-default rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Impostos e Descontos</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
                  <input type="checkbox" checked={empForm.inss_exempt} onChange={e => setEmpForm(p=>({...p,inss_exempt:e.target.checked}))} className="rounded" />
                  Isento de INSS
                </label>
                <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
                  <input type="checkbox" checked={empForm.irps_exempt} onChange={e => setEmpForm(p=>({...p,irps_exempt:e.target.checked}))} className="rounded" />
                  Isento de IRPS
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Taxa de INSS (%)</label>
                  <input type="number" step="0.1" min="0" max="100" placeholder="3.0 (padrão)"
                    disabled={empForm.inss_exempt}
                    value={empForm.inss_rate} onChange={e => setEmpForm(p=>({...p,inss_rate:e.target.value}))}
                    className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`} />
                </div>
                <div>
                  <label className={labelCls}>Taxa de IRPS (%)</label>
                  <input type="number" step="0.1" min="0" max="100" placeholder="tabela (padrão)"
                    disabled={empForm.irps_exempt}
                    value={empForm.irps_rate} onChange={e => setEmpForm(p=>({...p,irps_rate:e.target.value}))}
                    className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`} />
                </div>
              </div>
              <p className="text-[11px] text-content-muted">Deixa em branco para usar o padrão: INSS 3% e IRPS pela tabela progressiva. A contribuição da entidade mantém-se em 4%.</p>
            </div>
            <div className="border border-border-default rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Dados de Pagamento</p>
              <div>
                <label className={labelCls}>Método de Pagamento</label>
                <select value={empForm.payment_method} onChange={e => setEmpForm(p=>({...p,payment_method:e.target.value}))} className={inputCls}>
                  <option value="bank">Transferência Bancária</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="emola">e-Mola</option>
                  <option value="cash">Numerário</option>
                </select>
              </div>
              {empForm.payment_method === 'bank' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Banco</label>
                    <input value={empForm.bank_name} onChange={e => setEmpForm(p=>({...p,bank_name:e.target.value}))} placeholder="Ex: BCI, Millennium BIM..." className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>NIB</label>
                    <input value={empForm.bank_nib} onChange={e => setEmpForm(p=>({...p,bank_nib:e.target.value}))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Nº de Conta</label>
                    <input value={empForm.bank_account} onChange={e => setEmpForm(p=>({...p,bank_account:e.target.value}))} className={inputCls} />
                  </div>
                </div>
              )}
              {empForm.payment_method === 'mpesa' && (
                <div>
                  <label className={labelCls}>Número M-Pesa</label>
                  <input value={empForm.mpesa_number} onChange={e => setEmpForm(p=>({...p,mpesa_number:e.target.value}))} placeholder="+258 8X XXX XXXX" className={inputCls} />
                </div>
              )}
              {empForm.payment_method === 'emola' && (
                <div>
                  <label className={labelCls}>Número e-Mola</label>
                  <input value={empForm.emola_number} onChange={e => setEmpForm(p=>({...p,emola_number:e.target.value}))} placeholder="+258 8X XXX XXXX" className={inputCls} />
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={empForm.notes} onChange={e => setEmpForm(p=>({...p,notes:e.target.value}))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setModal(null); setEditing(null); }} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveEmployee} disabled={saving || !empForm.full_name}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Departamento */}
      {modal === 'department' && (
        <Modal title={editing ? 'Editar Departamento' : 'Novo Departamento'} onClose={() => { setModal(null); setEditing(null); }}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome *</label>
              <input value={deptForm.name} onChange={e => setDeptForm(p=>({...p,name:e.target.value}))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Descrição</label>
              <textarea value={deptForm.description} onChange={e => setDeptForm(p=>({...p,description:e.target.value}))} rows={3} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModal(null); setEditing(null); }} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveDept} disabled={saving || !deptForm.name}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Ausência */}
      {modal === 'leave' && (
        <Modal title="Pedir Ausência" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Funcionário *</label>
              <select value={leaveForm.employee_id} onChange={e => setLeaveForm(p=>({...p,employee_id:e.target.value}))} className={inputCls}>
                <option value="">Seleccionar…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo</label>
                <select value={leaveForm.type} onChange={e => setLeaveForm(p=>({...p,type:e.target.value}))} className={inputCls}>
                  {Object.entries(LEAVE_TYPES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Dias</label>
                <input type="number" min="1" value={leaveForm.days} onChange={e => setLeaveForm(p=>({...p,days:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data Início</label>
                <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p=>({...p,start_date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data Fim</label>
                <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p=>({...p,end_date:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Motivo</label>
              <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p=>({...p,reason:e.target.value}))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveLeave} disabled={saving || !leaveForm.employee_id || !leaveForm.start_date}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enviar Pedido
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* Modal Registo de Horas */}
      {modal === 'timesheet' && (
        <Modal title="Novo Registo de Horas" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Funcionário</label>
                <select value={tsForm.employee_id} onChange={e => setTsForm(p=>({...p,employee_id:e.target.value}))} className={inputCls}>
                  <option value="">Seleccionar…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Projecto</label>
                <select value={tsForm.project_id} onChange={e => setTsForm(p=>({...p,project_id:e.target.value}))} className={inputCls}>
                  <option value="">Nenhum</option>
                  {tsProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data</label>
                <input type="date" value={tsForm.date} onChange={e => setTsForm(p=>({...p,date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Horas *</label>
                <input type="number" step="0.5" min="0.5" max="24" value={tsForm.hours} onChange={e => setTsForm(p=>({...p,hours:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Descrição</label>
              <input value={tsForm.description} onChange={e => setTsForm(p=>({...p,description:e.target.value}))} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
              <input type="checkbox" checked={tsForm.billable} onChange={e => setTsForm(p=>({...p,billable:e.target.checked}))} className="rounded" />
              Facturável ao cliente
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveTimesheet} disabled={saving || !tsForm.hours}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Novo Período */}
      {periodModal && (
        <Modal title="Novo Período de Salários" onClose={() => setPeriodModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome do Período *</label>
              <input placeholder="Ex: Junho 2026" value={periodForm.period_name} onChange={e => setPeriodForm(p=>({...p,period_name:e.target.value}))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data Início *</label>
                <input type="date" value={periodForm.start_date} onChange={e => setPeriodForm(p=>({...p,start_date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data Fim *</label>
                <input type="date" value={periodForm.end_date} onChange={e => setPeriodForm(p=>({...p,end_date:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={periodForm.notes} onChange={e => setPeriodForm(p=>({...p,notes:e.target.value}))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPeriodModal(false)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={createPeriod} disabled={saving || !periodForm.period_name || !periodForm.start_date}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Criar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Editar Recibo */}
      {slipModal && editingSlip && (
        <Modal title={`Editar Recibo — ${editingSlip.full_name}`} onClose={() => { setSlipModal(false); setEditingSlip(null); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Salário Bruto (MT)</label>
                <input type="number" step="0.01" value={slipForm.gross_salary} onChange={e => setSlipForm(p=>({...p,gross_salary:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>INSS Funcionário (3%)</label>
                <input type="number" step="0.01" value={slipForm.inss_employee} onChange={e => setSlipForm(p=>({...p,inss_employee:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>INSS Entidade (4%)</label>
                <input type="number" step="0.01" value={slipForm.inss_employer} onChange={e => setSlipForm(p=>({...p,inss_employer:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>IRPS</label>
                <input type="number" step="0.01" value={slipForm.irps} onChange={e => setSlipForm(p=>({...p,irps:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Outras Deduções</label>
                <input type="number" step="0.01" value={slipForm.other_deductions} onChange={e => setSlipForm(p=>({...p,other_deductions:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Outros Adicionais</label>
                <input type="number" step="0.01" value={slipForm.other_additions} onChange={e => setSlipForm(p=>({...p,other_additions:e.target.value}))} className={inputCls} />
              </div>
            </div>
            <div className="bg-surface-overlay rounded-lg p-3 text-sm">
              <span className="text-content-muted">Salário Líquido estimado: </span>
              <span className="font-bold text-green-700 dark:text-green-400">
                MT {Math.max(0, (parseFloat(slipForm.gross_salary)||0) - (parseFloat(slipForm.inss_employee)||0) - (parseFloat(slipForm.irps)||0) - (parseFloat(slipForm.other_deductions)||0) + (parseFloat(slipForm.other_additions)||0)).toFixed(2)}
              </span>
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={slipForm.notes} onChange={e => setSlipForm(p=>({...p,notes:e.target.value}))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setSlipModal(false); setEditingSlip(null); }} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveSlip} disabled={saving}
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

export default HR;
