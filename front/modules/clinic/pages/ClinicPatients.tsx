import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { PageShell } from '../../core/components/layout/PageShell';
import api, { getApiToken, downloadBlob } from '../../core/services/apiClient';
import { useConfirm } from '../../core/contexts/ConfirmContext';
import {
  Search, ChevronRight, ClipboardList, Trash2, UserPlus, Pencil, Plus, X, Loader2,
  Calendar, Pill, Paperclip, Upload, Download, PackagePlus, FileType2,
} from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';
import {
  API_BASE, AREAS, SEX_OPTIONS, OBJECTIVE_OPTIONS, REFERRAL_OPTIONS, BIORESONANCE_AREAS,
  BIORESONANCE_STATUS_OPTIONS, EMPTY_RECORD_FORM, emptyBioresonance, formatFileSize,
  APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS, PROTOCOL_STATUS_LABELS, PROTOCOL_STATUS_COLORS,
  inputCls, labelCls, Modal, AreaBadge,
  Patient, RecommendedProduct, HerbalTea, BioresonanceReading, ClinicalRecord, Appointment,
  ProtocolItem, Protocol, CustomerLite, ProductLite,
} from '../shared';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

export function ClinicPatients({ showToast }: Props) {
  const confirm = useConfirm();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  const [q, setQ] = useState('');
  const [newPatientModal, setNewPatientModal] = useState(false);
  const [newPatientMode, setNewPatientMode] = useState<'existing' | 'new'>('existing');
  const [newPatientCustomerId, setNewPatientCustomerId] = useState('');
  const [newPatientAllergies, setNewPatientAllergies] = useState('');
  const [newPatientBirthDate, setNewPatientBirthDate] = useState('');
  const [newPatientSex, setNewPatientSex] = useState('');
  const [newPatientProfession, setNewPatientProfession] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const [detailPatientId, setDetailPatientId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'ficha' | 'protocols' | 'agenda'>('ficha');
  const [patientRecords, setPatientRecords] = useState<ClinicalRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [detailProtocols, setDetailProtocols] = useState<Protocol[]>([]);
  const [detailAppointments, setDetailAppointments] = useState<Appointment[]>([]);

  const [editPatientModal, setEditPatientModal] = useState(false);
  const [editPatientForm, setEditPatientForm] = useState({ birthDate: '', sex: '', profession: '', allergies: '' });

  const [recordModal, setRecordModal] = useState<null | 'new' | ClinicalRecord>(null);
  const [recordForm, setRecordForm] = useState(EMPTY_RECORD_FORM);
  const [recordProducts, setRecordProducts] = useState<RecommendedProduct[]>([]);
  const [recordHerbs, setRecordHerbs] = useState<HerbalTea[]>([]);
  const [recordBioresonance, setRecordBioresonance] = useState<BioresonanceReading[]>(emptyBioresonance());
  const [recordPriorities, setRecordPriorities] = useState<string[]>([]);
  const [downloadingFicha, setDownloadingFicha] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [appointmentModal, setAppointmentModal] = useState<{ patientId?: string } | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({ patientId: '', area: AREAS[0].id as string, scheduledAt: '', durationMinutes: '60', status: 'agendado', notes: '' });

  const [protocolModal, setProtocolModal] = useState<{ patientId?: string } | null>(null);
  const [protocolForm, setProtocolForm] = useState({ patientId: '', area: AREAS[3].id as string, title: '', startDate: '', endDate: '', notes: '' });
  const [protocolItems, setProtocolItems] = useState<ProtocolItem[]>([{ productId: '', dosageText: '', frequencyText: '', quantityPerDispense: 1 }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.get<Patient[]>('/clinic/patients');
      setPatients(p);
    } catch { showToast?.('Erro ao carregar pacientes', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Deep-link vindo do Dashboard (abrir a ficha de um paciente específico)
  useEffect(() => {
    const openId = (location.state as any)?.openPatientId;
    if (openId) { setDetailPatientId(openId); setDetailTab('ficha'); window.history.replaceState({}, ''); }
  }, [location.state]);

  useEffect(() => {
    if (!newPatientModal) return;
    if (customers.length) return;
    api.get<CustomerLite[]>('/customers').then(setCustomers).catch(() => {});
  }, [newPatientModal, customers.length]);

  useEffect(() => {
    if (!protocolModal && !recordModal) return;
    if (products.length) return;
    api.get<ProductLite[]>('/products').then(setProducts).catch(() => {});
  }, [protocolModal, recordModal, products.length]);

  const loadPatientRecords = useCallback(async (patientId: string) => {
    setLoadingRecords(true);
    try {
      const data = await api.get<ClinicalRecord[]>(`/clinic/records?patientId=${patientId}`);
      setPatientRecords(data);
    } catch { showToast?.('Erro ao carregar ficha clínica', 'error'); }
    finally { setLoadingRecords(false); }
  }, [showToast]);

  const loadPatientAppointments = useCallback(async (patientId: string) => {
    try { setDetailAppointments(await api.get<Appointment[]>(`/clinic/appointments?patientId=${patientId}`)); }
    catch { setDetailAppointments([]); }
  }, []);

  const loadPatientProtocols = useCallback(async (patientId: string) => {
    try { setDetailProtocols(await api.get<Protocol[]>(`/clinic/protocols?patientId=${patientId}`)); }
    catch { setDetailProtocols([]); }
  }, []);

  useEffect(() => {
    if (!detailPatientId) return;
    loadPatientRecords(detailPatientId);
    loadPatientAppointments(detailPatientId);
    loadPatientProtocols(detailPatientId);
  }, [detailPatientId, loadPatientRecords, loadPatientAppointments, loadPatientProtocols]);

  const patientsAlreadyLinked = useMemo(() => new Set(patients.map(p => p.customerId)), [patients]);
  const availableCustomers = useMemo(() => customers
    .filter(c => !patientsAlreadyLinked.has(c.id))
    .filter(c => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || '').includes(customerSearch)),
    [customers, patientsAlreadyLinked, customerSearch]);

  const filteredPatients = patients.filter(p => !q || p.customerName?.toLowerCase().includes(q.toLowerCase()));
  const detailPatient = patients.find(p => p.id === detailPatientId) || null;

  const resetNewPatientForm = () => {
    setNewPatientModal(false); setNewPatientMode('existing'); setNewPatientCustomerId('');
    setNewPatientAllergies(''); setNewPatientBirthDate(''); setNewPatientSex(''); setNewPatientProfession('');
    setNewPatientName(''); setNewPatientPhone(''); setNewPatientEmail(''); setCustomerSearch('');
  };

  const createPatient = async () => {
    if (newPatientMode === 'existing' && !newPatientCustomerId) return;
    if (newPatientMode === 'new' && !newPatientName.trim()) return;
    setSaving(true);
    try {
      let customerId = newPatientCustomerId;
      if (newPatientMode === 'new') {
        const customer = await api.post<CustomerLite>('/customers', {
          name: newPatientName.trim(),
          phone: newPatientPhone || undefined,
          email: newPatientEmail || undefined,
        });
        customerId = customer.id;
        setCustomers(prev => [...prev, customer]);
      }
      await api.post('/clinic/patients', {
        customerId,
        allergies: newPatientAllergies || undefined,
        birthDate: newPatientBirthDate || undefined,
        sex: newPatientSex || undefined,
        profession: newPatientProfession || undefined,
      });
      showToast?.('Paciente adicionado', 'success');
      resetNewPatientForm();
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao adicionar paciente', 'error'); }
    finally { setSaving(false); }
  };

  const openEditPatient = () => {
    if (!detailPatient) return;
    setEditPatientForm({
      birthDate: detailPatient.birthDate ? detailPatient.birthDate.slice(0, 10) : '',
      sex: detailPatient.sex || '',
      profession: detailPatient.profession || '',
      allergies: detailPatient.allergies || '',
    });
    setEditPatientModal(true);
  };

  const saveEditPatient = async () => {
    if (!detailPatientId) return;
    setSaving(true);
    try {
      await api.put(`/clinic/patients/${detailPatientId}`, editPatientForm);
      showToast?.('Dados do paciente atualizados', 'success');
      setEditPatientModal(false);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao atualizar paciente', 'error'); }
    finally { setSaving(false); }
  };

  const deletePatient = async (patient: Patient, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm(
      `Isto vai apagar permanentemente o paciente "${patient.customerName}" e todo o seu histórico clínico (ficha, consultas e planos de tratamento). O registo de cliente na loja não é afetado. Esta ação não pode ser revertida.`,
      { title: 'Apagar Paciente', confirmLabel: 'Apagar', variant: 'danger' }
    );
    if (!ok) return;
    try {
      await api.delete(`/clinic/patients/${patient.id}`);
      showToast?.('Paciente apagado', 'success');
      if (detailPatientId === patient.id) setDetailPatientId(null);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao apagar paciente', 'error'); }
  };

  const openNewRecord = () => {
    setRecordForm(EMPTY_RECORD_FORM);
    setRecordProducts([]);
    setRecordHerbs([]);
    setRecordBioresonance(emptyBioresonance());
    setRecordPriorities([]);
    setPendingFiles([]);
    setRecordModal('new');
  };

  const openEditRecord = (r: ClinicalRecord) => {
    setRecordForm({
      area: r.area, recordType: r.recordType || 'consulta', summary: r.summary || '',
      consultationDate: r.data?.consultationDate || new Date().toISOString().slice(0, 10),
      objective: r.data?.objective || OBJECTIVE_OPTIONS[0],
      complaint: r.data?.complaint || '', symptomsDuration: r.data?.symptomsDuration || '',
      knownDiagnosis: r.data?.knownDiagnosis || '', medicationsInUse: r.data?.medicationsInUse || '',
      weight: r.data?.weight || '', height: r.data?.height || '', bloodPressure: r.data?.bloodPressure || '',
      nextConsultationDate: r.data?.nextConsultationDate || '',
      hydrationGoal: r.data?.hydrationGoal || '', dietaryGuidance: r.data?.dietaryGuidance || '',
      referral: r.data?.referral || REFERRAL_OPTIONS[0], referralOther: r.data?.referralOther || '',
      referralReason: r.data?.referralReason || '', examsToDiscuss: r.data?.examsToDiscuss || '',
      consentGiven: r.data?.consentGiven || false, consentDate: r.data?.consentDate || '',
      professionalName: r.data?.professionalName || '', professionalDate: r.data?.professionalDate || '',
    });
    setRecordProducts(r.data?.recommendedProducts || []);
    setRecordHerbs(r.data?.herbalTeas || []);
    setRecordBioresonance(r.data?.bioresonance?.length ? r.data.bioresonance : emptyBioresonance());
    setRecordPriorities(r.data?.priorityGuidelines || []);
    setPendingFiles([]);
    setRecordModal(r);
  };

  const downloadFicha = async (r: ClinicalRecord) => {
    if (!detailPatient) return;
    setDownloadingFicha(true);
    try {
      await downloadBlob(`/pdf/clinic-record/${r.id}`, `ficha-${detailPatient.customerName}-${r.data?.consultationDate || r.createdAt.slice(0, 10)}.pdf`);
    } catch (e: any) { showToast?.(e.message || 'Erro ao gerar ficha', 'error'); }
    finally { setDownloadingFicha(false); }
  };

  const uploadAttachmentToRecord = async (recordId: string, file: File): Promise<ClinicalRecord> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getApiToken();
    const res = await fetch(`${API_BASE}/clinic/records/${recordId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no upload' }));
      throw new Error(err.error || 'Erro no upload');
    }
    return res.json();
  };

  const saveRecord = async () => {
    if (!detailPatientId) return;
    setSaving(true);
    try {
      const payload = {
        area: recordForm.area,
        recordType: recordForm.recordType,
        summary: recordForm.summary,
        data: {
          consultationDate: recordForm.consultationDate || undefined,
          objective: recordForm.objective || undefined,
          complaint: recordForm.complaint || undefined,
          symptomsDuration: recordForm.symptomsDuration || undefined,
          knownDiagnosis: recordForm.knownDiagnosis || undefined,
          medicationsInUse: recordForm.medicationsInUse || undefined,
          weight: recordForm.weight || undefined,
          height: recordForm.height || undefined,
          bloodPressure: recordForm.bloodPressure || undefined,
          nextConsultationDate: recordForm.nextConsultationDate || undefined,
          recommendedProducts: recordProducts.filter(p => p.productId || p.customName),
          herbalTeas: recordHerbs.filter(h => h.plant),
          bioresonance: recordBioresonance.filter(b => b.area.trim()),
          hydrationGoal: recordForm.hydrationGoal || undefined,
          dietaryGuidance: recordForm.dietaryGuidance || undefined,
          referral: recordForm.referral || undefined,
          referralOther: recordForm.referral === 'Outro' ? (recordForm.referralOther || undefined) : undefined,
          referralReason: recordForm.referralReason || undefined,
          examsToDiscuss: recordForm.examsToDiscuss || undefined,
          priorityGuidelines: recordPriorities.filter(p => p.trim()),
          consentGiven: recordForm.consentGiven,
          consentDate: recordForm.consentDate || undefined,
          professionalName: recordForm.professionalName || undefined,
          professionalDate: recordForm.professionalDate || undefined,
        },
      };
      let recordId = recordModal !== 'new' ? recordModal?.id : undefined;
      if (recordModal === 'new') {
        const created = await api.post<ClinicalRecord>('/clinic/records', { patientId: detailPatientId, ...payload });
        recordId = created.id;
        showToast?.('Registo adicionado à ficha clínica', 'success');
      } else if (recordModal) {
        await api.put(`/clinic/records/${recordModal.id}`, payload);
        showToast?.('Registo atualizado', 'success');
      }
      if (recordId && pendingFiles.length) {
        for (const file of pendingFiles) {
          try { await uploadAttachmentToRecord(recordId, file); }
          catch (e: any) { showToast?.(e.message || `Erro ao anexar ${file.name}`, 'error'); }
        }
      }
      setRecordModal(null);
      setPendingFiles([]);
      loadPatientRecords(detailPatientId);
    } catch (e: any) { showToast?.(e.message || 'Erro ao guardar registo', 'error'); }
    finally { setSaving(false); }
  };

  const uploadAttachment = async (file: File) => {
    if (recordModal === 'new') { setPendingFiles(prev => [...prev, file]); return; }
    if (!recordModal) return;
    setUploadingAttachment(true);
    try {
      const updated = await uploadAttachmentToRecord(recordModal.id, file);
      setRecordModal(updated);
      if (detailPatientId) loadPatientRecords(detailPatientId);
      showToast?.('Documento anexado', 'success');
    } catch (e: any) { showToast?.(e.message || 'Erro ao anexar documento', 'error'); }
    finally { setUploadingAttachment(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const deleteAttachment = async (index: number) => {
    if (recordModal === 'new') { setPendingFiles(prev => prev.filter((_, i) => i !== index)); return; }
    if (!recordModal) return;
    try {
      const updated = await api.delete<ClinicalRecord>(`/clinic/records/${recordModal.id}/attachments/${index}`);
      setRecordModal(updated);
      if (detailPatientId) loadPatientRecords(detailPatientId);
    } catch { showToast?.('Erro ao remover anexo', 'error'); }
  };

  const openAppointmentModal = (patientId?: string) => {
    setAppointmentForm({ patientId: patientId || '', area: AREAS[0].id, scheduledAt: '', durationMinutes: '60', status: 'agendado', notes: '' });
    setAppointmentModal({ patientId });
  };

  const createAppointment = async () => {
    if (!appointmentForm.patientId || !appointmentForm.scheduledAt) return;
    setSaving(true);
    try {
      await api.post('/clinic/appointments', {
        ...appointmentForm,
        durationMinutes: Number(appointmentForm.durationMinutes) || 60,
        scheduledAt: new Date(appointmentForm.scheduledAt).toISOString(),
      });
      showToast?.('Consulta agendada', 'success');
      setAppointmentModal(null);
      if (detailPatientId) loadPatientAppointments(detailPatientId);
    } catch (e: any) { showToast?.(e.message || 'Erro ao agendar consulta', 'error'); }
    finally { setSaving(false); }
  };

  const openProtocolModal = (patientId?: string) => {
    setProtocolForm({ patientId: patientId || '', area: AREAS[3].id, title: '', startDate: '', endDate: '', notes: '' });
    setProtocolItems([{ productId: '', dosageText: '', frequencyText: '', quantityPerDispense: 1 }]);
    setProtocolModal({ patientId });
  };

  const createProtocol = async () => {
    if (!protocolForm.patientId || !protocolForm.title) return;
    setSaving(true);
    try {
      const items = protocolItems.filter(i => i.productId);
      await api.post('/clinic/protocols', { ...protocolForm, items });
      showToast?.('Plano de tratamento criado' + (items.length ? ' e stock atualizado' : ''), 'success');
      setProtocolModal(null);
      if (detailPatientId) loadPatientProtocols(detailPatientId);
    } catch (e: any) { showToast?.(e.message || 'Erro ao criar plano de tratamento', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <PageShell title="Pacientes" description="Fichas clínicas e histórico de pacientes"
      actions={
        <button onClick={() => setNewPatientModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
          <UserPlus className="w-4 h-4" /> Novo Paciente
        </button>
      }>
      <div className="bg-surface-raised rounded-2xl border border-border-default p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar paciente…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-border-default rounded-lg bg-surface-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div className="space-y-2">
              {filteredPatients.map(p => (
                <div key={p.id} onClick={() => { setDetailPatientId(p.id); setDetailTab('ficha'); }}
                  className="flex items-center gap-4 border border-border-default rounded-xl p-4 hover:bg-surface-overlay/30 transition-colors cursor-pointer">
                  <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-xs font-bold shrink-0">
                    {p.customerName?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-content-primary truncate">{p.customerName}</p>
                    <p className="text-xs text-content-muted">{p.customerPhone || p.customerEmail || '—'}</p>
                  </div>
                  {p.allergies && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">Alergias</span>
                  )}
                  <button onClick={(e) => deletePatient(p, e)} title="Apagar paciente"
                    className="shrink-0 p-1.5 rounded-lg text-content-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
                </div>
              ))}
              {filteredPatients.length === 0 && (
                <p className="text-center py-12 text-content-muted">Nenhum paciente encontrado. Adicione um cliente existente como paciente para começar.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal: Novo Paciente */}
      {newPatientModal && (
        <Modal title="Novo Paciente" onClose={resetNewPatientForm}>
          <div className="space-y-4">
            <div className="flex border border-border-default rounded-lg p-1 bg-surface-base">
              <button onClick={() => setNewPatientMode('existing')}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${newPatientMode === 'existing' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}>
                Cliente existente
              </button>
              <button onClick={() => setNewPatientMode('new')}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${newPatientMode === 'new' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}>
                Paciente novo
              </button>
            </div>

            {newPatientMode === 'existing' ? (
              <div>
                <label className={labelCls}>Cliente *</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Pesquisar por nome ou telefone…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border-default rounded-lg bg-surface-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="max-h-48 overflow-y-auto border border-border-default rounded-lg divide-y divide-border-default">
                  {availableCustomers.slice(0, 50).map(c => (
                    <button key={c.id} onClick={() => setNewPatientCustomerId(c.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-overlay ${newPatientCustomerId === c.id ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400' : 'text-content-primary'}`}>
                      {c.name} <span className="text-content-muted text-xs">{c.phone}</span>
                    </button>
                  ))}
                  {availableCustomers.length === 0 && <p className="px-3 py-4 text-xs text-content-muted text-center">Nenhum cliente disponível</p>}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nome completo *</label>
                  <input value={newPatientName} onChange={e => setNewPatientName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input value={newPatientPhone} onChange={e => setNewPatientPhone(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={newPatientEmail} onChange={e => setNewPatientEmail(e.target.value)} className={inputCls} />
                </div>
                <p className="col-span-2 text-xs text-content-muted">Cria um novo registo de cliente e regista-o de imediato como paciente da clínica.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Sexo</label>
                <select value={newPatientSex} onChange={e => setNewPatientSex(e.target.value)} className={inputCls}>
                  <option value="">Não especificado</option>
                  {SEX_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data de Nascimento</label>
                <input type="date" value={newPatientBirthDate} onChange={e => setNewPatientBirthDate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Profissão</label>
              <input value={newPatientProfession} onChange={e => setNewPatientProfession(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Alergias conhecidas</label>
              <textarea value={newPatientAllergies} onChange={e => setNewPatientAllergies(e.target.value)} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={resetNewPatientForm} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={createPatient} disabled={saving || (newPatientMode === 'existing' ? !newPatientCustomerId : !newPatientName.trim())}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Ficha do Paciente */}
      {detailPatient && (
        <Modal title={detailPatient.customerName} onClose={() => setDetailPatientId(null)} wide>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-content-muted flex-1">
                {detailPatient.fileNumber != null && <span><span className="text-content-secondary font-medium">Nº Ficha:</span> {String(detailPatient.fileNumber).padStart(4, '0')}</span>}
                {detailPatient.customerPhone && <span><span className="text-content-secondary font-medium">Telefone:</span> {detailPatient.customerPhone}</span>}
                {detailPatient.customerEmail && <span className="truncate"><span className="text-content-secondary font-medium">Email:</span> {detailPatient.customerEmail}</span>}
                {detailPatient.sex && <span><span className="text-content-secondary font-medium">Sexo:</span> {SEX_OPTIONS.find(s => s.value === detailPatient.sex)?.label || detailPatient.sex}</span>}
                {detailPatient.birthDate && <span><span className="text-content-secondary font-medium">Nascimento:</span> {new Date(detailPatient.birthDate).toLocaleDateString('pt-PT')}</span>}
                {detailPatient.profession && <span className="truncate"><span className="text-content-secondary font-medium">Profissão:</span> {detailPatient.profession}</span>}
                {detailPatient.allergies && (
                  <span className="col-span-full mt-1">
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Alergias: {detailPatient.allergies}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={openEditPatient} title="Editar dados do paciente"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => deletePatient(detailPatient)} title="Apagar paciente"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border-default rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-3.5 h-3.5" /> Apagar
                </button>
              </div>
            </div>

            <div className="flex border-b border-border-default">
              {[
                { id: 'ficha', label: 'Ficha Clínica', icon: ClipboardList },
                { id: 'protocols', label: 'Planos', icon: Pill },
                { id: 'agenda', label: 'Agenda', icon: Calendar },
              ].map(t => (
                <button key={t.id} onClick={() => setDetailTab(t.id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-content-muted hover:text-content-primary'}`}>
                  <t.icon className="w-3.5 h-3.5" />{t.label}
                </button>
              ))}
            </div>

            {detailTab === 'ficha' ? (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button onClick={openNewRecord}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium">
                    <Plus className="w-3.5 h-3.5" /> Novo Registo
                  </button>
                </div>
                {loadingRecords ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-content-muted" /></div>
                ) : (
                  <div className="space-y-2">
                    {patientRecords.map(r => (
                      <div key={r.id} onClick={() => openEditRecord(r)}
                        className="border border-border-default rounded-xl p-3 cursor-pointer hover:bg-surface-overlay/30 transition-colors">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <AreaBadge area={r.area} />
                            {r.data?.objective && <span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay text-content-secondary">{r.data.objective}</span>}
                          </div>
                          <span className="text-xs text-content-muted">
                            {r.data?.consultationDate ? new Date(r.data.consultationDate).toLocaleDateString('pt-PT') : new Date(r.createdAt).toLocaleDateString('pt-PT')}
                          </span>
                        </div>
                        {r.data?.complaint && <p className="text-sm text-content-secondary mt-2"><span className="text-content-muted">Queixa:</span> {r.data.complaint}</p>}
                        {r.summary && <p className="text-sm text-content-secondary mt-1">{r.summary}</p>}
                        <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-content-muted">
                          {r.data?.weight && <span>Peso: {r.data.weight} kg</span>}
                          {r.data?.height && <span>Altura: {r.data.height} m</span>}
                          {r.data?.bloodPressure && <span>PA: {r.data.bloodPressure}</span>}
                          {r.data?.nextConsultationDate && <span className="text-brand-600 dark:text-brand-400">Próxima: {new Date(r.data.nextConsultationDate).toLocaleDateString('pt-PT')}</span>}
                          {!!r.data?.recommendedProducts?.length && (
                            <span className="flex items-center gap-1"><PackagePlus className="w-3 h-3" /> {r.data.recommendedProducts.length} produto(s)</span>
                          )}
                          {!!r.attachments?.length && (
                            <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" /> {r.attachments.length} anexo(s)</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {patientRecords.length === 0 && <p className="text-center py-8 text-content-muted text-sm">Sem registos clínicos ainda</p>}
                  </div>
                )}
              </div>
            ) : detailTab === 'protocols' ? (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button onClick={() => openProtocolModal(detailPatient.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium">
                    <Plus className="w-3.5 h-3.5" /> Novo Plano
                  </button>
                </div>
                {detailProtocols.map(p => (
                  <div key={p.id} className="border border-border-default rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-content-primary text-sm">{p.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PROTOCOL_STATUS_COLORS[p.status]}`}>{PROTOCOL_STATUS_LABELS[p.status]}</span>
                    </div>
                    <AreaBadge area={p.area} />
                  </div>
                ))}
                {detailProtocols.length === 0 && <p className="text-center py-8 text-content-muted text-sm">Sem planos de tratamento ativos</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button onClick={() => openAppointmentModal(detailPatient.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium">
                    <Plus className="w-3.5 h-3.5" /> Nova Consulta
                  </button>
                </div>
                {detailAppointments.map(a => (
                  <div key={a.id} className="border border-border-default rounded-xl p-3 flex items-center justify-between gap-2">
                    <div>
                      <AreaBadge area={a.area} />
                      <p className="text-xs text-content-muted mt-1">{new Date(a.scheduledAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${APPOINTMENT_STATUS_COLORS[a.status]}`}>{APPOINTMENT_STATUS_LABELS[a.status]}</span>
                  </div>
                ))}
                {detailAppointments.length === 0 && <p className="text-center py-8 text-content-muted text-sm">Sem consultas agendadas</p>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: Editar Paciente */}
      {editPatientModal && detailPatient && (
        <Modal title={`Editar Dados — ${detailPatient.customerName}`} onClose={() => setEditPatientModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Sexo</label>
                <select value={editPatientForm.sex} onChange={e => setEditPatientForm(p => ({ ...p, sex: e.target.value }))} className={inputCls}>
                  <option value="">Não especificado</option>
                  {SEX_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data de Nascimento</label>
                <input type="date" value={editPatientForm.birthDate} onChange={e => setEditPatientForm(p => ({ ...p, birthDate: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Profissão</label>
              <input value={editPatientForm.profession} onChange={e => setEditPatientForm(p => ({ ...p, profession: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Alergias conhecidas</label>
              <textarea value={editPatientForm.allergies} onChange={e => setEditPatientForm(p => ({ ...p, allergies: e.target.value }))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditPatientModal(false)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={saveEditPatient} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Registo Clínico (novo / editar) */}
      {recordModal && detailPatient && (
        <Modal title={recordModal === 'new' ? `Novo Registo — ${detailPatient.customerName}` : `Editar Registo — ${detailPatient.customerName}`}
          onClose={() => setRecordModal(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data da Consulta</label>
                <input type="date" value={recordForm.consultationDate} onChange={e => setRecordForm(p => ({ ...p, consultationDate: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Área *</label>
                <select value={recordForm.area} onChange={e => setRecordForm(p => ({ ...p, area: e.target.value }))} className={inputCls}>
                  {AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Objectivo</label>
              <select value={recordForm.objective} onChange={e => setRecordForm(p => ({ ...p, objective: e.target.value }))} className={inputCls}>
                {OBJECTIVE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Queixas / Motivo da consulta</label>
                <textarea value={recordForm.complaint} onChange={e => setRecordForm(p => ({ ...p, complaint: e.target.value }))} rows={2} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Há quanto tempo</label>
                <input value={recordForm.symptomsDuration} onChange={e => setRecordForm(p => ({ ...p, symptomsDuration: e.target.value }))} className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Diagnóstico médico conhecido</label>
                <input value={recordForm.knownDiagnosis} onChange={e => setRecordForm(p => ({ ...p, knownDiagnosis: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Medicamentos em uso</label>
                <input value={recordForm.medicationsInUse} onChange={e => setRecordForm(p => ({ ...p, medicationsInUse: e.target.value }))} className={inputCls} />
              </div>
            </div>

            {/* Avaliação Complementar por Biorressonância */}
            <div className="border border-border-default rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Avaliação Complementar por Biorressonância</p>
              <div className="space-y-1.5">
                {recordBioresonance.map((row, idx) => {
                  const isFixed = BIORESONANCE_AREAS.includes(row.area);
                  return (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-center">
                      {isFixed ? (
                        <span className="sm:col-span-3 text-sm text-content-secondary truncate">{row.area}</span>
                      ) : (
                        <input placeholder="Outro (especificar)" value={row.area}
                          onChange={e => setRecordBioresonance(items => items.map((it, i) => i === idx ? { ...it, area: e.target.value } : it))}
                          className={inputCls + ' sm:col-span-3'} />
                      )}
                      <div className="sm:col-span-5 flex gap-1">
                        {BIORESONANCE_STATUS_OPTIONS.map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setRecordBioresonance(items => items.map((it, i) => i === idx ? { ...it, status: it.status === opt.value ? '' : opt.value } : it))}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${row.status === opt.value ? 'bg-brand-600 border-brand-600 text-white' : 'border-border-default text-content-secondary hover:bg-surface-overlay'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <input placeholder="Observação" value={row.observation || ''}
                        onChange={e => setRecordBioresonance(items => items.map((it, i) => i === idx ? { ...it, observation: e.target.value } : it))}
                        className={inputCls + (isFixed ? ' sm:col-span-4' : ' sm:col-span-3')} />
                      {!isFixed && (
                        <button onClick={() => setRecordBioresonance(items => items.filter((_, i) => i !== idx))} className="sm:col-span-1 flex items-center justify-center text-content-muted hover:text-red-600 py-1.5">
                          <Trash2 className="w-4 h-4" /><span className="sm:hidden ml-2 text-xs">Remover</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setRecordBioresonance(items => [...items, { area: '', status: '', observation: '' }])}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar outro
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Peso (kg)</label>
                <input value={recordForm.weight} onChange={e => setRecordForm(p => ({ ...p, weight: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Altura (m)</label>
                <input value={recordForm.height} onChange={e => setRecordForm(p => ({ ...p, height: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Pressão Arterial</label>
                <input value={recordForm.bloodPressure} onChange={e => setRecordForm(p => ({ ...p, bloodPressure: e.target.value }))} placeholder="Ex: 120/80" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Próxima Consulta</label>
              <input type="date" value={recordForm.nextConsultationDate} onChange={e => setRecordForm(p => ({ ...p, nextConsultationDate: e.target.value }))} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Resumo / Notas</label>
              <textarea value={recordForm.summary} onChange={e => setRecordForm(p => ({ ...p, summary: e.target.value }))} rows={3} className={inputCls} />
            </div>

            {/* Plano de Cuidados */}
            <div className="border border-border-default rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Plano de Cuidados</p>
              <div>
                <label className={labelCls}>Meta de Hidratação</label>
                <input value={recordForm.hydrationGoal} onChange={e => setRecordForm(p => ({ ...p, hydrationGoal: e.target.value }))} placeholder="Ex: 2L de água por dia" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Orientação Alimentar Individual</label>
                <textarea value={recordForm.dietaryGuidance} onChange={e => setRecordForm(p => ({ ...p, dietaryGuidance: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>

            {/* Suplementação Complementar */}
            <div className="border border-border-default rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Suplementação Complementar</p>
                <button onClick={() => setRecordProducts(items => [...items, { productId: '', customName: '', objective: '', guidance: '', duration: '' }])}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar produto
                </button>
              </div>
              <div className="space-y-2">
                {recordProducts.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-start border border-border-default rounded-lg p-2">
                    <select value={item.productId || ''} onChange={e => setRecordProducts(items => items.map((it, i) => i === idx ? { ...it, productId: e.target.value, customName: e.target.value ? '' : it.customName } : it))}
                      className={inputCls + ' sm:col-span-3'}>
                      <option value="">Produto da loja…</option>
                      {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                    </select>
                    <input placeholder="Ou nome manual" value={item.customName || ''} disabled={!!item.productId}
                      onChange={e => setRecordProducts(items => items.map((it, i) => i === idx ? { ...it, customName: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-3 disabled:opacity-50'} />
                    <input placeholder="Objectivo" value={item.objective || ''}
                      onChange={e => setRecordProducts(items => items.map((it, i) => i === idx ? { ...it, objective: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-2'} />
                    <input placeholder="Orientação" value={item.guidance || ''}
                      onChange={e => setRecordProducts(items => items.map((it, i) => i === idx ? { ...it, guidance: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-2'} />
                    <input placeholder="Duração" value={item.duration || ''}
                      onChange={e => setRecordProducts(items => items.map((it, i) => i === idx ? { ...it, duration: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-1'} />
                    <button onClick={() => setRecordProducts(items => items.filter((_, i) => i !== idx))} className="sm:col-span-1 flex items-center justify-center gap-2 text-content-muted hover:text-red-600 py-2">
                      <Trash2 className="w-4 h-4" /><span className="sm:hidden text-xs">Remover produto</span>
                    </button>
                  </div>
                ))}
                {recordProducts.length === 0 && <p className="text-xs text-content-muted">Nenhum produto recomendado. Pode ser um produto da loja ou um nome manual.</p>}
              </div>
            </div>

            {/* Plantas e Chás */}
            <div className="border border-border-default rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Plantas e Chás</p>
                <button onClick={() => setRecordHerbs(items => [...items, { plant: '', objective: '', guidance: '', period: '' }])}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar planta/chá
                </button>
              </div>
              <div className="space-y-2">
                {recordHerbs.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-start border border-border-default rounded-lg p-2">
                    <input placeholder="Planta / chá" value={item.plant} onChange={e => setRecordHerbs(items => items.map((it, i) => i === idx ? { ...it, plant: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-3'} />
                    <input placeholder="Objectivo de bem-estar" value={item.objective || ''} onChange={e => setRecordHerbs(items => items.map((it, i) => i === idx ? { ...it, objective: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-3'} />
                    <input placeholder="Orientação" value={item.guidance || ''} onChange={e => setRecordHerbs(items => items.map((it, i) => i === idx ? { ...it, guidance: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-3'} />
                    <input placeholder="Período" value={item.period || ''} onChange={e => setRecordHerbs(items => items.map((it, i) => i === idx ? { ...it, period: e.target.value } : it))}
                      className={inputCls + ' sm:col-span-2'} />
                    <button onClick={() => setRecordHerbs(items => items.filter((_, i) => i !== idx))} className="sm:col-span-1 flex items-center justify-center gap-2 text-content-muted hover:text-red-600 py-2">
                      <Trash2 className="w-4 h-4" /><span className="sm:hidden text-xs">Remover planta/chá</span>
                    </button>
                  </div>
                ))}
                {recordHerbs.length === 0 && <p className="text-xs text-content-muted">Nenhuma planta/chá recomendado.</p>}
              </div>
            </div>

            {/* Encaminhamento */}
            <div className="border border-border-default rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Encaminhamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Encaminhar para</label>
                  <select value={recordForm.referral} onChange={e => setRecordForm(p => ({ ...p, referral: e.target.value }))} className={inputCls}>
                    {REFERRAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {recordForm.referral === 'Outro' && (
                  <div>
                    <label className={labelCls}>Especificar</label>
                    <input value={recordForm.referralOther} onChange={e => setRecordForm(p => ({ ...p, referralOther: e.target.value }))} className={inputCls} />
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Motivo do encaminhamento</label>
                <input value={recordForm.referralReason} onChange={e => setRecordForm(p => ({ ...p, referralReason: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Exames/avaliações a discutir com o profissional de saúde</label>
                <textarea value={recordForm.examsToDiscuss} onChange={e => setRecordForm(p => ({ ...p, examsToDiscuss: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>

            {/* Conclusão e Orientações Prioritárias */}
            <div className="border border-border-default rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Conclusão e Orientações Prioritárias</p>
                <button onClick={() => setRecordPriorities(items => [...items, ''])}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
              <div className="space-y-2">
                {recordPriorities.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-content-muted w-4 shrink-0">{idx + 1}.</span>
                    <input value={item} onChange={e => setRecordPriorities(items => items.map((it, i) => i === idx ? e.target.value : it))} className={inputCls} />
                    <button onClick={() => setRecordPriorities(items => items.filter((_, i) => i !== idx))} className="shrink-0 text-content-muted hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {recordPriorities.length === 0 && <p className="text-xs text-content-muted">Nenhuma orientação prioritária registada.</p>}
              </div>
            </div>

            {/* Termo de Ciência */}
            <div className="border border-border-default rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Termo de Ciência</p>
              <label className="flex items-start gap-2 text-sm text-content-secondary cursor-pointer">
                <input type="checkbox" checked={recordForm.consentGiven} onChange={e => setRecordForm(p => ({ ...p, consentGiven: e.target.checked }))} className="mt-0.5" />
                Declaro ter recebido explicação sobre as orientações de bem-estar apresentadas e compreender que não substituem diagnóstico, tratamento ou acompanhamento médico.
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Data (utente)</label>
                  <input type="date" value={recordForm.consentDate} onChange={e => setRecordForm(p => ({ ...p, consentDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Data (profissional)</label>
                  <input type="date" value={recordForm.professionalDate} onChange={e => setRecordForm(p => ({ ...p, professionalDate: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Profissional responsável</label>
                <input value={recordForm.professionalName} onChange={e => setRecordForm(p => ({ ...p, professionalName: e.target.value }))} className={inputCls} />
              </div>
            </div>

            {/* Documentos anexados */}
            <div className="border border-border-default rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Documentos</p>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAttachment}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 disabled:opacity-50">
                  {uploadingAttachment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Carregar documento
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ''; }} />
              </div>
              <div className="space-y-1.5">
                {recordModal !== 'new' && (recordModal.attachments || []).map((att, idx) => {
                  const isImage = att.mimetype.startsWith('image/');
                  return (
                    <div key={idx} className="flex items-center gap-2 border border-border-default rounded-lg px-3 py-2">
                      {isImage ? (
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={att.url} alt={att.name} className="w-10 h-10 rounded object-cover border border-border-default" />
                        </a>
                      ) : (
                        <div className="w-10 h-10 rounded bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                          <FileType2 className="w-5 h-5 text-red-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-content-primary truncate">{att.name}</p>
                        <p className="text-xs text-content-muted">{isImage ? 'Imagem' : 'PDF'} · {formatFileSize(att.size)}</p>
                      </div>
                      <a href={att.url} target="_blank" rel="noopener noreferrer" title="Ver / Descarregar" className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted">
                        <Download className="w-4 h-4" />
                      </a>
                      <button onClick={() => deleteAttachment(idx)} title="Remover" className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                {recordModal === 'new' && pendingFiles.map((file, idx) => {
                  const isImage = file.type.startsWith('image/');
                  return (
                    <div key={idx} className="flex items-center gap-2 border border-dashed border-border-default rounded-lg px-3 py-2">
                      {isImage ? (
                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-10 h-10 rounded object-cover border border-border-default shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                          <FileType2 className="w-5 h-5 text-red-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-content-primary truncate">{file.name}</p>
                        <p className="text-xs text-content-muted">{isImage ? 'Imagem' : 'PDF'} · {formatFileSize(file.size)} · será carregado ao guardar</p>
                      </div>
                      <button onClick={() => deleteAttachment(idx)} title="Remover" className="p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                {(recordModal === 'new' ? pendingFiles.length === 0 : !(recordModal.attachments || []).length) && (
                  <p className="text-xs text-content-muted">Nenhum documento anexado</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {recordModal !== 'new' ? (
                <button onClick={() => downloadFicha(recordModal)} disabled={downloadingFicha}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay disabled:opacity-50">
                  {downloadingFicha ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Baixar Ficha
                </button>
              ) : <span />}
              <div className="flex justify-end gap-2">
                <button onClick={() => setRecordModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
                <button onClick={saveRecord} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Nova Consulta (a partir da ficha do paciente) */}
      {appointmentModal && (
        <Modal title="Nova Consulta" onClose={() => setAppointmentModal(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Área *</label>
              <select value={appointmentForm.area} onChange={e => setAppointmentForm(p => ({ ...p, area: e.target.value }))} className={inputCls}>
                {AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data e Hora *</label>
                <input type="datetime-local" value={appointmentForm.scheduledAt} onChange={e => setAppointmentForm(p => ({ ...p, scheduledAt: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Duração (min)</label>
                <input type="number" min="15" step="15" value={appointmentForm.durationMinutes} onChange={e => setAppointmentForm(p => ({ ...p, durationMinutes: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={appointmentForm.notes} onChange={e => setAppointmentForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAppointmentModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={createAppointment} disabled={saving || !appointmentForm.patientId || !appointmentForm.scheduledAt}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Agendar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Novo Plano de Tratamento (a partir da ficha do paciente) */}
      {protocolModal && (
        <Modal title="Novo Plano de Tratamento" onClose={() => setProtocolModal(null)} wide>
          <div className="space-y-4">
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
              <button onClick={() => setProtocolModal(null)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
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

export default ClinicPatients;
