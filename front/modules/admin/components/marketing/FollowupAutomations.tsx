import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock, Eye, Loader2, Play, RotateCcw, Save, ShieldCheck, Zap } from 'lucide-react';
import api from '../../../core/services/apiClient';

/**
 * Marketing › Automações — mensagens de follow-up que acompanham o cliente (backend/services/followupService.js).
 */

type Tier = { minSpent: number; percent: number };
interface Rule {
  key: string;
  title: string;
  category: string;
  description: string;
  marketing: boolean;
  enabled: boolean;
  config: Record<string, any>;
  templates: string[];
  defaultTemplates: string[];
  stats: { sent30d: number; failed30d: number; lastAt: string | null };
}
interface LogRow { id: number; rule_key: string; recipient: string | null; result: string | null; created_at: string; step: number }

type Toast = (msg: string, type: 'success' | 'error' | 'info') => void;

const PLACEHOLDERS: Record<string, string[]> = {
  payment_reminder: ['nome', 'pedido', 'total', 'link', 'loja'],
  review_request: ['nome', 'pedido', 'link', 'loja'],
  repurchase: ['nome', 'produto', 'link', 'loja'],
  winback: ['nome', 'cupao', 'desconto', 'validade', 'link', 'loja'],
  loyalty_coupon: ['nome', 'nivel', 'cupao', 'desconto', 'validade', 'link', 'loja'],
  new_products: ['nome', 'produtos', 'link', 'loja'],
  coupon_expiring: ['nome', 'cupao', 'desconto', 'validade', 'link', 'loja'],
};

const CHANNEL_OPTIONS = [
  { id: 'both', label: 'WhatsApp e email', hint: 'O cliente recebe nos dois' },
  { id: 'whatsapp_first', label: 'WhatsApp', hint: 'Email só se o WhatsApp falhar' },
  { id: 'email_only', label: 'Só email', hint: 'Sem WhatsApp' },
];
const CHANNEL_LABEL: Record<string, string> = { both: 'WhatsApp + email', whatsapp_first: 'WhatsApp', email_only: 'Email' };

const STEP_LABELS: Record<string, string[]> = {
  payment_reminder: ['1.º lembrete', '2.º lembrete', 'Último lembrete'],
};

const inputCls = 'w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500';
const numCls = 'w-24 rounded-lg border border-border-default bg-surface-base px-2.5 py-1.5 text-sm text-content-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 !min-h-0 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand-600' : 'bg-surface-overlay border border-border-default'}`}
  >
    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

const Num: React.FC<{ label: string; value: number; onChange: (n: number) => void; suffix?: string; min?: number; hint?: string }> = ({ label, value, onChange, suffix, min = 0, hint }) => (
  <label className="block text-sm text-content-secondary">
    <span className="block font-medium text-content-primary">{label}</span>
    <span className="mt-1 flex items-center gap-2">
      <input type="number" min={min} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(Number(e.target.value))} className={numCls} />
      {suffix && <span className="text-content-muted">{suffix}</span>}
    </span>
    {hint && <span className="mt-1 block text-xs text-content-muted">{hint}</span>}
  </label>
);

/** Campos de tempo/cupão de cada regra. */
const ConfigFields: React.FC<{ rule: Rule; config: Record<string, any>; set: (patch: Record<string, any>) => void }> = ({ rule, config, set }) => {
  switch (rule.key) {
    case 'payment_reminder': {
      const steps: number[] = config.stepsHours || [];
      return (
        <div className="space-y-3">
          {(STEP_LABELS.payment_reminder).map((label, i) => (
            <Num key={label} label={`${label} após`} suffix="horas do pedido" value={steps[i]}
              onChange={n => { const next = [...steps]; next[i] = n; set({ stepsHours: next }); }} min={1} />
          ))}
        </div>
      );
    }
    case 'review_request':
      return <Num label="Enviar" suffix="dias depois da entrega" value={config.daysAfterDelivery} onChange={n => set({ daysAfterDelivery: n })} />;
    case 'repurchase':
      return <Num label="Enviar" suffix="dias depois da entrega" value={config.daysAfterDelivery} onChange={n => set({ daysAfterDelivery: n })} min={1}
        hint="Ajuste à duração típica dos seus produtos (ex.: um frasco de 60 cápsulas ≈ 30 dias)." />;
    case 'winback':
      return (
        <div className="space-y-2">
          <Num label="Considerar inactivo após" suffix="dias sem comprar" value={config.inactiveDays} onChange={n => set({ inactiveDays: n })} min={7} />
          <Num label="Cupão de desconto" suffix="% (0 = sem cupão)" value={config.couponPercent} onChange={n => set({ couponPercent: n })} />
          <Num label="Validade do cupão" suffix="dias" value={config.couponValidDays} onChange={n => set({ couponValidDays: n })} min={1} />
          <Num label="Não repetir antes de" suffix="dias" value={config.repeatAfterDays} onChange={n => set({ repeatAfterDays: n })} min={7} />
        </div>
      );
    case 'loyalty_coupon': {
      const tiers: Tier[] = config.tiers || [];
      const update = (i: number, patch: Partial<Tier>) => set({ tiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
      return (
        <div className="space-y-2">
          <p className="text-xs text-content-muted">Total de compras pagas a partir de… → desconto do cupão</p>
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-content-secondary">
              <span className="w-14 shrink-0 font-medium text-content-primary">Nível {i + 1}</span>
              <input type="number" min={1} value={t.minSpent} onChange={e => update(i, { minSpent: Number(e.target.value) })} className={numCls} aria-label={`Compras a partir de (MT), nível ${i + 1}`} />
              <span className="shrink-0">MT →</span>
              <input type="number" min={1} max={90} value={t.percent} onChange={e => update(i, { percent: Number(e.target.value) })} className={`${numCls} !w-16`} aria-label={`Desconto (%), nível ${i + 1}`} />
              <span>%</span>
            </div>
          ))}
          <Num label="Validade do cupão" suffix="dias" value={config.couponValidDays} onChange={n => set({ couponValidDays: n })} min={1}
            hint="Conta o total de compras PAGAS do cliente (pelo número de telefone). Cada cupão é pessoal e de uso único." />
        </div>
      );
    }
    case 'new_products':
      return (
        <div className="space-y-2">
          <Num label="No máximo um resumo a cada" suffix="dias" value={config.minDaysBetween} onChange={n => set({ minDaysBetween: n })} min={1} />
          <Num label="Produtos por resumo" suffix="(máx.)" value={config.maxProducts} onChange={n => set({ maxProducts: n })} min={1} />
          <p className="text-xs text-content-muted">Inclui produtos novos visíveis na loja e promoções que começaram. Vai para os clientes que já compraram.</p>
        </div>
      );
    case 'coupon_expiring':
      return <Num label="Lembrar" suffix="dias antes de expirar" value={config.daysBefore} onChange={n => set({ daysBefore: n })} min={1} />;
    default:
      return null;
  }
};

const RuleCard: React.FC<{ rule: Rule; onSaved: (r: Rule) => void; showToast: Toast }> = ({ rule, onSaved, showToast }) => {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(rule.config);
  const [templates, setTemplates] = useState(rule.templates);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ index: number; text: string } | null>(null);

  useEffect(() => { setConfig(rule.config); setTemplates(rule.templates); }, [rule]);

  const dirty = JSON.stringify(config) !== JSON.stringify(rule.config) || JSON.stringify(templates) !== JSON.stringify(rule.templates);

  const save = async (patch: Partial<Pick<Rule, 'enabled'>> = {}) => {
    setSaving(true);
    try {
      const updated = await api.put<Rule>(`/followups/${rule.key}`, { config, templates, ...patch });
      onSaved(updated);
      showToast(patch.enabled === undefined ? 'Automação guardada' : patch.enabled ? `"${rule.title}" ligada` : `"${rule.title}" desligada`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Erro ao guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async (index: number) => {
    try {
      const r = await api.post<{ text: string }>(`/followups/${rule.key}/preview`, { templateIndex: index, template: templates[index] });
      setPreview({ index, text: r.text });
    } catch (e: any) { showToast(e.message || 'Erro na pré-visualização', 'error'); }
  };

  const insertVar = (i: number, v: string) => setTemplates(ts => ts.map((t, j) => (j === i ? `${t}{${v}}` : t)));

  return (
    <div className={`rounded-xl border bg-surface-raised ${rule.enabled ? 'border-brand-600/40' : 'border-border-default'}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-content-primary">{rule.title}</h4>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rule.marketing ? 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'}`}>
              {rule.marketing ? 'Promocional · respeita SAIR' : 'Aviso do pedido'}
            </span>
            <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-[11px] font-medium text-content-secondary">
              {CHANNEL_LABEL[rule.config.channels || 'both']}
            </span>
          </div>
          <p className="mt-1 text-sm text-content-muted">{rule.description}</p>
          <p className="mt-1.5 text-xs text-content-muted">
            {rule.stats.sent30d} enviada(s) nos últimos 30 dias
            {rule.stats.failed30d > 0 && <span className="text-red-600 dark:text-red-400"> · {rule.stats.failed30d} falha(s)</span>}
            {rule.stats.lastAt && <> · última {new Date(rule.stats.lastAt).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' })}</>}
          </p>
        </div>
        <Toggle checked={rule.enabled} disabled={saving} label={`Ligar ${rule.title}`} onChange={v => save({ enabled: v })} />
      </div>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-t border-border-default px-4 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-overlay/50"
      >
        Tempos e mensagem
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border-default p-4">
          <fieldset>
            <legend className="text-sm font-medium text-content-primary">Enviar por</legend>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {CHANNEL_OPTIONS.map(o => (
                <label key={o.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${(config.channels || 'both') === o.id ? 'border-brand-600 bg-brand-600/5' : 'border-border-default hover:bg-surface-overlay/50'}`}>
                  <input type="radio" name={`ch-${rule.key}`} checked={(config.channels || 'both') === o.id}
                    onChange={() => setConfig(c => ({ ...c, channels: o.id }))} className="mt-0.5 accent-brand-600" />
                  <span>
                    <span className="block font-medium text-content-primary">{o.label}</span>
                    <span className="block text-xs text-content-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {rule.key === 'new_products' && (
            <label className="flex items-start gap-2 text-sm text-content-secondary">
              <input type="checkbox" checked={config.sendImages !== false} onChange={e => setConfig(c => ({ ...c, sendImages: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span>Montra com fotos: no WhatsApp cada produto segue como foto com preço e link; no email, cartões com foto e botão Comprar.</span>
            </label>
          )}
          <ConfigFields rule={rule} config={config} set={patch => setConfig(c => ({ ...c, ...patch }))} />

          {templates.map((tpl, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`tpl-${rule.key}-${i}`} className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                  {STEP_LABELS[rule.key]?.[i] || 'Mensagem'}
                </label>
                <button type="button" onClick={() => setTemplates(ts => ts.map((t, j) => (j === i ? rule.defaultTemplates[i] : t)))}
                  className="inline-flex items-center gap-1 text-xs text-content-muted hover:text-content-primary">
                  <RotateCcw className="h-3 w-3" aria-hidden="true" /> Repor texto original
                </button>
              </div>
              <textarea id={`tpl-${rule.key}-${i}`} value={tpl} onChange={e => setTemplates(ts => ts.map((t, j) => (j === i ? e.target.value : t)))}
                rows={5} className={`${inputCls} resize-y`} />
              <div className="flex flex-wrap items-center gap-1.5">
                {(PLACEHOLDERS[rule.key] || []).map(v => (
                  <button key={v} type="button" onClick={() => insertVar(i, v)}
                    className="rounded-md border border-border-default bg-surface-base px-1.5 py-0.5 font-mono text-[11px] text-content-secondary hover:border-brand-500">
                    {`{${v}}`}
                  </button>
                ))}
                <button type="button" onClick={() => showPreview(i)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-300">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Pré-visualizar
                </button>
              </div>
              {preview?.index === i && (
                <div className="rounded-xl bg-[#e7ffdb] p-3 text-sm text-gray-900 shadow-sm dark:bg-[#005c4b] dark:text-gray-100">
                  <p className="whitespace-pre-wrap break-words">{preview.text}</p>
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-content-muted">*texto* fica a negrito e _texto_ em itálico no WhatsApp. Linhas com uma variável vazia (ex.: sem cupão) são omitidas.</p>

          <div className="flex justify-end">
            <button type="button" onClick={() => save()} disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const RULE_TITLES: Record<string, string> = {};

export const FollowupAutomations: React.FC<{ showToast: Toast }> = ({ showToast }) => {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Rule[]>('/followups');
      r.forEach(x => { RULE_TITLES[x.key] = x.title; });
      setRules(r);
    } catch (e: any) { showToast(e.message || 'Erro ao carregar automações', 'error'); setRules([]); }
    api.get<LogRow[]>('/followups/log?limit=30').then(setLog).catch(() => {});
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Rule[]>();
    (rules || []).forEach(r => { if (!map.has(r.category)) map.set(r.category, []); map.get(r.category)!.push(r); });
    return Array.from(map.entries());
  }, [rules]);

  const runNow = async () => {
    setRunning(true);
    try {
      await api.post('/followups/run', {});
      showToast('Ronda iniciada — as mensagens devidas estão a ser enviadas', 'success');
      setTimeout(load, 8000);
    } catch (e: any) { showToast(e.message || 'Erro ao executar', 'error'); }
    finally { setRunning(false); }
  };

  if (!rules) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-content-muted" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-4 sm:flex-row sm:items-center">
        <Zap className="hidden h-8 w-8 shrink-0 text-brand-600 sm:block" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm text-content-secondary">
          <p className="font-semibold text-content-primary">Follow-up automático por WhatsApp e email</p>
          <p className="mt-0.5 text-xs">
            Não precisa de escolher números: cada automação encontra sozinha os clientes certos a partir dos pedidos
            (ex.: quem não pagou, quem recebeu há X dias, quem passou um valor de compras). Basta ligá-la.
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Verifica de 10 em 10 min · envia das 08:00 às 20:00</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Pausa entre mensagens · nunca repete · só conta a partir de quando liga</span>
          </p>
        </div>
        <button type="button" onClick={runNow} disabled={running}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-content-secondary hover:bg-surface-overlay disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Executar agora
        </button>
      </div>

      {grouped.map(([category, list]) => (
        <section key={category} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">{category}</h3>
          {list.map(r => (
            <RuleCard key={r.key} rule={r} showToast={showToast}
              onSaved={updated => setRules(rs => (rs || []).map(x => (x.key === updated.key ? updated : x)))} />
          ))}
        </section>
      ))}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">Últimas mensagens automáticas</h3>
        {log.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-default py-6 text-center text-xs text-content-muted">Ainda não foram enviadas mensagens automáticas.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border-default overflow-y-auto rounded-xl border border-border-default bg-surface-raised">
            {log.map(l => {
              const ok = l.result?.startsWith('whatsapp:');
              return (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-green-500' : l.result?.startsWith('ignorado') ? 'bg-gray-400' : 'bg-red-500'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-content-primary">
                    {RULE_TITLES[l.rule_key] || l.rule_key}
                    <span className="text-content-muted"> · {l.recipient}</span>
                  </span>
                  <span className="shrink-0 text-xs text-content-muted">{new Date(l.created_at).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default FollowupAutomations;
