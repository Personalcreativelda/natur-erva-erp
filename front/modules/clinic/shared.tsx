import React from 'react';
import { createPortal } from 'react-dom';
import { X, Stethoscope, Activity, Salad, Leaf, BookOpen } from 'lucide-react';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3060/api';

// ─── Áreas da clínica ──────────────────────────────────────────────────────────

export const AREAS = [
  { id: 'consulta_integrativa', label: 'Consulta Integrativa' },
  { id: 'bioressonancia', label: 'Bioressonância e Avaliação Funcional' },
  { id: 'nutricao_integrativa', label: 'Nutrição Integrativa' },
  { id: 'fitoterapia_suplementacao', label: 'Fitoterapia e Suplementação' },
  { id: 'educacao_saude', label: 'Educação em Saúde' },
] as const;
export const AREA_LABELS: Record<string, string> = Object.fromEntries(AREAS.map(a => [a.id, a.label]));
export const AREA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  consulta_integrativa: Stethoscope,
  bioressonancia: Activity,
  nutricao_integrativa: Salad,
  fitoterapia_suplementacao: Leaf,
  educacao_saude: BookOpen,
};
export const AREA_ACCENTS: Record<string, string> = {
  consulta_integrativa: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
  bioressonancia: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
  nutricao_integrativa: 'bg-green-50 dark:bg-green-900/20 text-green-600',
  fitoterapia_suplementacao: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600',
  educacao_saude: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600',
};

export const OBJECTIVE_OPTIONS = [
  'Avaliação geral', 'Nutrição', 'Controlo de peso', 'Saúde feminina', 'Saúde masculina',
  'Planeamento para gravidez', 'Acompanhamento complementar', 'Outro',
];
export const SEX_OPTIONS = [{ value: 'feminino', label: 'Feminino' }, { value: 'masculino', label: 'Masculino' }];
export const REFERRAL_OPTIONS = [
  'Sem encaminhamento imediato', 'Medicina Geral/Internista', 'Ginecologia/Obstetrícia',
  'Nutricionista', 'Endocrinologia', 'Cardiologia', 'Outro',
];
export const BIORESONANCE_AREAS = [
  'Cardiovascular', 'Metabólica / glicose', 'Fígado', 'Rins', 'Sistema digestivo',
  'Vitaminas', 'Minerais', 'Saúde óssea', 'Sistema hormonal', 'Saúde feminina / masculina',
];
export const BIORESONANCE_STATUS_OPTIONS = [
  { value: 'normal', label: 'Normal' }, { value: 'baixo', label: 'Baixo' }, { value: 'elevado', label: 'Elevado/Alterado' },
];

export const EMPTY_RECORD_FORM = {
  area: AREAS[0].id as string, recordType: 'consulta', summary: '',
  consultationDate: new Date().toISOString().slice(0, 10),
  objective: OBJECTIVE_OPTIONS[0], complaint: '', symptomsDuration: '',
  knownDiagnosis: '', medicationsInUse: '', weight: '', height: '', bloodPressure: '',
  nextConsultationDate: '',
  hydrationGoal: '', dietaryGuidance: '',
  referral: REFERRAL_OPTIONS[0], referralOther: '', referralReason: '', examsToDiscuss: '',
  consentGiven: false, consentDate: '', professionalName: '', professionalDate: '',
};

export const emptyBioresonance = () => BIORESONANCE_AREAS.map(area => ({ area, status: '', observation: '' }));

export function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type Patient = {
  id: string; customerId: string; customerName: string; customerPhone?: string; customerEmail?: string;
  fileNumber?: number; birthDate?: string; sex?: string; profession?: string;
  healthHistory: Record<string, any>; allergies?: string; isActive: boolean; notes?: string; createdAt: string;
};
export type RecommendedProduct = { productId?: string; customName?: string; objective?: string; guidance?: string; duration?: string };
export type HerbalTea = { plant: string; objective?: string; guidance?: string; period?: string };
export type BioresonanceReading = { area: string; status: string; observation?: string };
export type Attachment = { name: string; url: string; mimetype: string; size: number; uploadedAt: string };
export type RecordData = {
  consultationDate?: string;
  objective?: string;
  complaint?: string;
  symptomsDuration?: string;
  knownDiagnosis?: string;
  medicationsInUse?: string;
  weight?: string;
  height?: string;
  bloodPressure?: string;
  nextConsultationDate?: string;
  recommendedProducts?: RecommendedProduct[];
  herbalTeas?: HerbalTea[];
  bioresonance?: BioresonanceReading[];
  hydrationGoal?: string;
  dietaryGuidance?: string;
  referral?: string;
  referralOther?: string;
  referralReason?: string;
  examsToDiscuss?: string;
  priorityGuidelines?: string[];
  consentGiven?: boolean;
  consentDate?: string;
  professionalName?: string;
  professionalDate?: string;
};
export type ClinicalRecord = {
  id: string; patientId: string; area: string; recordType: string; summary?: string;
  data: RecordData; attachments?: Attachment[]; createdAt: string;
};
export type Appointment = {
  id: string; patientId: string; patientName: string; area: string; scheduledAt: string;
  durationMinutes: number; status: string; notes?: string;
};
export type ProtocolItem = { id?: string; productId: string; productName?: string; dosageText?: string; frequencyText?: string; quantityPerDispense: number };
export type Protocol = {
  id: string; patientId: string; area: string; title: string; startDate: string; endDate?: string;
  status: string; notes?: string; items?: ProtocolItem[];
};
export type Stats = { activePatients: number; appointmentsThisWeek: number; activeProtocols: number; recordsByArea: { area: string; count: number }[] };
export type CustomerLite = { id: string; name: string; phone?: string; email?: string };
export type ProductLite = { id: string; name: string; stock: number };

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou',
};
export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  agendado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  confirmado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  concluido: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  faltou: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};
export const PROTOCOL_STATUS_LABELS: Record<string, string> = { ativo: 'Ativo', concluido: 'Concluído', suspenso: 'Suspenso' };
export const PROTOCOL_STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  concluido: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  suspenso: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500';
export const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

// ─── Componentes partilhados ────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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

export function AreaBadge({ area }: { area: string }) {
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 whitespace-nowrap">{AREA_LABELS[area] || area}</span>;
}

export function KpiCard({ label, value, sub, icon, accent }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; accent: string }) {
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
