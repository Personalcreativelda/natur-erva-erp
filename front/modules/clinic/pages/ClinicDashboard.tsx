import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../../core/components/layout/PageShell';
import api from '../../core/services/apiClient';
import { Users, Calendar, Pill, FileHeart, ChevronRight, CalendarClock, Loader2 } from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';
import { AREAS, AREA_ICONS, AREA_ACCENTS, KpiCard, AreaBadge, Patient, Appointment, Stats } from '../shared';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

export function ClinicDashboard({ showToast }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, a] = await Promise.all([
        api.get<Stats>('/clinic/stats'),
        api.get<Patient[]>('/clinic/patients'),
        api.get<Appointment[]>('/clinic/appointments'),
      ]);
      setStats(s); setPatients(p); setAppointments(a);
    } catch { showToast?.('Erro ao carregar dados da clínica', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openPatient = (id: string) => navigate('/admin/clinica/pacientes', { state: { openPatientId: id } });

  const upcoming = appointments
    .filter(a => new Date(a.scheduledAt).getTime() >= Date.now() && a.status !== 'cancelado')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5);

  const recentPatients = [...patients]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <PageShell title="Visão Geral" description="Consulta Integrativa, Bioressonância, Nutrição, Fitoterapia e Educação em Saúde">
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
      ) : (
        <div className="space-y-4">
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Pacientes Ativos" value={stats.activePatients} sub="acompanhamento em curso"
                icon={<Users className="w-4 h-4 text-blue-600" />} accent="bg-blue-50 dark:bg-blue-900/20" />
              <KpiCard label="Consultas" value={stats.appointmentsThisWeek} sub="próximos 7 dias"
                icon={<Calendar className="w-4 h-4 text-green-600" />} accent="bg-green-50 dark:bg-green-900/20" />
              <KpiCard label="Planos Ativos" value={stats.activeProtocols} sub="planos de tratamento em curso"
                icon={<Pill className="w-4 h-4 text-purple-600" />} accent="bg-purple-50 dark:bg-purple-900/20" />
              <KpiCard label="Registos Clínicos" value={stats.recordsByArea.reduce((sum, r) => sum + r.count, 0)} sub="total na ficha clínica"
                icon={<FileHeart className="w-4 h-4 text-amber-600" />} accent="bg-amber-50 dark:bg-amber-900/20" />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AREAS.map(a => {
              const count = stats?.recordsByArea.find(r => r.area === a.id)?.count || 0;
              const Icon = AREA_ICONS[a.id];
              return (
                <div key={a.id} className="bg-surface-raised border border-border-default rounded-xl p-3.5 flex flex-col gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${AREA_ACCENTS[a.id]}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <p className="text-lg font-bold text-content-primary leading-none">{count}</p>
                  <p className="text-xs text-content-muted leading-tight truncate" title={a.label}>{a.label}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface-raised border border-border-default rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-content-primary flex items-center gap-2">
                  <Users className="w-4 h-4 text-content-muted" />
                  Pacientes
                </h3>
                {patients.length > 5 && (
                  <button onClick={() => navigate('/admin/clinica/pacientes')} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                    Ver todos
                  </button>
                )}
              </div>
              {recentPatients.length === 0 ? (
                <p className="text-sm text-content-muted text-center py-8">Nenhum paciente registado</p>
              ) : (
                <div className="space-y-2">
                  {recentPatients.map(p => (
                    <div key={p.id} onClick={() => openPatient(p.id)}
                      className="flex items-center gap-3 border border-border-default rounded-lg px-3 py-2.5 hover:bg-surface-overlay/30 transition-colors cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-xs font-bold shrink-0">
                        {p.customerName?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">{p.customerName}</p>
                        <p className="text-xs text-content-muted truncate">{p.customerPhone || p.customerEmail || '—'}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface-raised border border-border-default rounded-xl p-5">
              <h3 className="font-semibold text-content-primary mb-4 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-content-muted" />
                Próximas Consultas
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-content-muted text-center py-8">Sem consultas agendadas</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map(a => (
                    <div key={a.id} className="flex items-center gap-3 border border-border-default rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">{a.patientName}</p>
                        <p className="text-xs text-content-muted">{new Date(a.scheduledAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</p>
                      </div>
                      <AreaBadge area={a.area} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default ClinicDashboard;
