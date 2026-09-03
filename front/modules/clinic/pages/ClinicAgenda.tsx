import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../../core/components/layout/PageShell';
import api from '../../core/services/apiClient';
import { Plus, Loader2 } from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';
import {
  AREAS, APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS, inputCls, labelCls,
  Modal, AreaBadge, Patient, Appointment,
} from '../shared';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

export function ClinicAgenda({ showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const [appointmentModal, setAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({ patientId: '', area: AREAS[0].id as string, scheduledAt: '', durationMinutes: '60', status: 'agendado', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        api.get<Appointment[]>('/clinic/appointments'),
        api.get<Patient[]>('/clinic/patients'),
      ]);
      setAppointments(a); setPatients(p);
    } catch { showToast?.('Erro ao carregar agenda', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openAppointmentModal = () => {
    setAppointmentForm({ patientId: '', area: AREAS[0].id, scheduledAt: '', durationMinutes: '60', status: 'agendado', notes: '' });
    setAppointmentModal(true);
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
      setAppointmentModal(false);
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao agendar consulta', 'error'); }
    finally { setSaving(false); }
  };

  const updateAppointmentStatus = async (id: string, status: string) => {
    try {
      await api.put(`/clinic/appointments/${id}`, { status });
      showToast?.('Estado atualizado', 'success'); load();
    } catch { showToast?.('Erro', 'error'); }
  };

  return (
    <PageShell title="Agenda" description="Consultas e agendamentos da clínica"
      actions={
        <button onClick={openAppointmentModal}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nova Consulta
        </button>
      }>
      <div className="bg-surface-raised rounded-2xl border border-border-default p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
        ) : (
          <div className="space-y-2">
            {appointments.map(a => (
              <div key={a.id} className="flex items-center gap-4 border border-border-default rounded-xl p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-content-primary">{a.patientName}</span>
                    <AreaBadge area={a.area} />
                  </div>
                  <p className="text-xs text-content-muted mt-0.5">
                    {new Date(a.scheduledAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })} · {a.durationMinutes} min
                  </p>
                  {a.notes && <p className="text-xs text-content-secondary mt-1 truncate">{a.notes}</p>}
                </div>
                <select value={a.status} onChange={e => updateAppointmentStatus(a.id, e.target.value)}
                  className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium border-0 ${APPOINTMENT_STATUS_COLORS[a.status]}`}>
                  {Object.entries(APPOINTMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
            {appointments.length === 0 && <p className="text-center py-12 text-content-muted">Nenhuma consulta agendada</p>}
          </div>
        )}
      </div>

      {appointmentModal && (
        <Modal title="Nova Consulta" onClose={() => setAppointmentModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Paciente *</label>
              <select value={appointmentForm.patientId} onChange={e => setAppointmentForm(p => ({ ...p, patientId: e.target.value }))} className={inputCls}>
                <option value="">Selecionar…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.customerName}</option>)}
              </select>
            </div>
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
              <button onClick={() => setAppointmentModal(false)} className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay">Cancelar</button>
              <button onClick={createAppointment} disabled={saving || !appointmentForm.patientId || !appointmentForm.scheduledAt}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Agendar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

export default ClinicAgenda;
