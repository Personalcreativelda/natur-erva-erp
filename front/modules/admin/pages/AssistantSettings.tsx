import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../../core/components/layout/PageShell';
import api from '../../core/services/apiClient';
import { Bot, Loader2, Plus, X, Send, Copy, Check, BellRing, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import type { Toast } from '../../core/components/ui/Toast';

interface Props { showToast?: (msg: string, type: Toast['type']) => void; }

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3060/api';

type Config = {
  isEnabled: boolean;
  evolutionBaseUrl: string | null;
  evolutionInstance: string | null;
  evolutionApiKey: string | null;
  hasEvolutionApiKey: boolean;
  webhookSecret: string;
  llmProvider: 'openai' | 'anthropic' | 'gemini' | null;
  llmApiKey: string | null;
  hasLlmApiKey: boolean;
  llmModel: string | null;
  authorizedNumbers: string[];
  customerNotifyEnabled?: boolean;
  customerNotifyMode?: NotifyMode;
};

type NotifyMode = 'whatsapp_first' | 'both' | 'email_only';

type NotificationLog = {
  id: number;
  order_id: string | null;
  order_number: string | null;
  event: string;
  channel: 'whatsapp' | 'email';
  recipient: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

const NOTIFY_MODES: { id: NotifyMode; label: string; hint: string }[] = [
  { id: 'whatsapp_first', label: 'WhatsApp, com email se falhar', hint: 'Recomendado. Se o número não tiver WhatsApp ou o envio falhar, segue por email.' },
  { id: 'both', label: 'WhatsApp e email', hint: 'O cliente recebe nos dois canais.' },
  { id: 'email_only', label: 'Só email', hint: 'Não envia WhatsApp aos clientes.' },
];

const EVENT_LABELS: Record<string, string> = {
  order_created: 'Pedido recebido',
  payment_confirmed: 'Pagamento confirmado',
  payment_rejected: 'Pagamento rejeitado',
  status_confirmed: 'Confirmado',
  status_processing: 'Em preparação',
  status_out_for_delivery: 'Saiu para entrega',
  status_delivered: 'Entregue',
  status_completed: 'Concluído',
  status_cancelled: 'Cancelado',
  test: 'Teste',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Enviado', cls: 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-900/30' },
  sent_fallback: { label: 'Enviado (alternativa)', cls: 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30' },
  failed: { label: 'Falhou', cls: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30' },
};

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-content-secondary mb-1';

export function AssistantSettings({ showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [isEnabled, setIsEnabled] = useState(false);
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState('');
  const [evolutionInstance, setEvolutionInstance] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'anthropic' | 'gemini'>('anthropic');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [authorizedNumbers, setAuthorizedNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [customerNotifyEnabled, setCustomerNotifyEnabled] = useState(true);
  const [customerNotifyMode, setCustomerNotifyMode] = useState<NotifyMode>('whatsapp_first');
  const [testPhone, setTestPhone] = useState('');
  const [testingCustomer, setTestingCustomer] = useState(false);
  const [logs, setLogs] = useState<NotificationLog[] | null>(null);

  const loadLogs = useCallback(async () => {
    try { setLogs(await api.get<NotificationLog[]>('/assistant/customer-notifications?limit=30')); }
    catch { setLogs([]); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await api.get<Config>('/assistant/config');
      setIsEnabled(c.isEnabled);
      setEvolutionBaseUrl(c.evolutionBaseUrl || '');
      setEvolutionInstance(c.evolutionInstance || '');
      setEvolutionApiKey(c.evolutionApiKey || '');
      setWebhookSecret(c.webhookSecret);
      setLlmProvider(c.llmProvider || 'anthropic');
      setLlmApiKey(c.llmApiKey || '');
      setLlmModel(c.llmModel || '');
      setAuthorizedNumbers(c.authorizedNumbers || []);
      setCustomerNotifyEnabled(c.customerNotifyEnabled !== false);
      setCustomerNotifyMode(c.customerNotifyMode || 'whatsapp_first');
    } catch (e: any) { showToast?.(e.message || 'Erro ao carregar configuração', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); loadLogs(); }, [load, loadLogs]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/assistant/config', {
        isEnabled, evolutionBaseUrl, evolutionInstance, evolutionApiKey,
        llmProvider, llmApiKey, llmModel: llmModel || undefined,
        authorizedNumbers,
        customerNotifyEnabled, customerNotifyMode,
      });
      showToast?.('Configuração guardada', 'success');
      load();
    } catch (e: any) { showToast?.(e.message || 'Erro ao guardar configuração', 'error'); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      await api.post('/assistant/test-connection', {});
      showToast?.('Mensagem de teste enviada — confirme no WhatsApp', 'success');
    } catch (e: any) { showToast?.(e.message || 'Erro ao testar ligação', 'error'); }
    finally { setTesting(false); }
  };

  const testCustomerNotify = async () => {
    setTestingCustomer(true);
    try {
      await api.post('/assistant/customer-notify/test', { phone: testPhone });
      showToast?.('Mensagem de teste enviada — confirme no WhatsApp', 'success');
      loadLogs();
    } catch (e: any) { showToast?.(e.message || 'Não foi possível enviar o teste', 'error'); }
    finally { setTestingCustomer(false); }
  };

  const addNumber = () => {
    const clean = newNumber.replace(/\D/g, '');
    if (!clean || authorizedNumbers.includes(clean)) return;
    setAuthorizedNumbers(prev => [...prev, clean]);
    setNewNumber('');
  };

  const webhookUrl = `${API_BASE}/assistant/webhook/${webhookSecret}`;
  const copyWebhook = () => {
    navigator.clipboard?.writeText(webhookUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (loading) {
    return (
      <PageShell title="Assistente IA" description="Assistente de consulta ao negócio via WhatsApp">
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Assistente IA" description="Assistente de consulta ao negócio via WhatsApp (Evolution API)"
      actions={
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
        </button>
      }>
      <div className="space-y-4">
        <div className="bg-surface-raised border border-border-default rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-content-primary flex items-center gap-2"><Bot className="w-4 h-4" /> Assistente ativo</h3>
              <p className="text-xs text-content-muted mt-1">
                Responde a perguntas (stock, vendas, encomendas) e trata dos pagamentos M-Pesa/e-Mola: confirmar, rejeitar e associar SMS do comerciante.
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-surface-overlay rounded-full peer peer-checked:bg-brand-600 transition-colors relative">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isEnabled ? 'translate-x-5' : ''}`} />
              </div>
            </label>
          </div>
        </div>

        {/* ── Notificações aos clientes ───────────────────────────────────────── */}
        <div className="bg-surface-raised border border-border-default rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-content-primary flex items-center gap-2"><BellRing className="w-4 h-4" /> Notificações aos clientes</h3>
              <p className="text-xs text-content-muted mt-1 max-w-2xl">
                Confirmação do pedido, mudanças de estado (em preparação, a caminho, entregue…) e pagamento confirmado ou rejeitado,
                enviados pela mesma Evolution API. Funciona mesmo com o assistente desligado. As respostas dos clientes
                <strong> não</strong> chegam ao assistente — ele só conversa com os números autorizados.
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" checked={customerNotifyEnabled} onChange={e => setCustomerNotifyEnabled(e.target.checked)} className="sr-only peer" aria-label="Activar notificações aos clientes" />
              <div className="w-11 h-6 bg-surface-overlay rounded-full peer peer-checked:bg-brand-600 transition-colors relative">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${customerNotifyEnabled ? 'translate-x-5' : ''}`} />
              </div>
            </label>
          </div>

          <fieldset className={`grid grid-cols-1 md:grid-cols-3 gap-2 ${customerNotifyEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <legend className="sr-only">Como enviar</legend>
            {NOTIFY_MODES.map(m => (
              <label key={m.id}
                className={`flex gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${customerNotifyMode === m.id ? 'border-brand-600 bg-brand-50/60 dark:bg-brand-900/20' : 'border-border-default hover:bg-surface-overlay'}`}>
                <input type="radio" name="customer-notify-mode" value={m.id} checked={customerNotifyMode === m.id}
                  onChange={() => setCustomerNotifyMode(m.id)} className="mt-0.5 accent-brand-600" />
                <span>
                  <span className="block text-sm font-medium text-content-primary">{m.label}</span>
                  <span className="block text-xs text-content-muted mt-0.5">{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 max-w-sm">
              <label className={labelCls} htmlFor="customer-test-phone">Enviar mensagem de teste para</label>
              <input id="customer-test-phone" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="84 123 4567" inputMode="tel" className={inputCls} />
            </div>
            <button onClick={testCustomerNotify} disabled={testingCustomer || !testPhone.trim()}
              className="flex items-center justify-center gap-2 px-3 py-2 border border-border-default rounded-lg text-sm font-medium text-content-secondary hover:bg-surface-overlay disabled:opacity-50">
              {testingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar teste
            </button>
          </div>
          <p className="text-xs text-content-muted -mt-2">Guarde primeiro a configuração da Evolution API. Números de Moçambique com ou sem 258.</p>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Últimos envios</p>
              <button onClick={loadLogs} className="inline-flex items-center gap-1 text-xs text-content-muted hover:text-content-primary">
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Actualizar
              </button>
            </div>
            {logs === null ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-content-muted" /></div>
            ) : logs.length === 0 ? (
              <p className="text-xs text-content-muted text-center py-6 border border-dashed border-border-default rounded-lg">Ainda não foram enviadas notificações.</p>
            ) : (
              <ul className="divide-y divide-border-default border border-border-default rounded-lg max-h-80 overflow-y-auto">
                {logs.map(l => {
                  const st = STATUS_LABELS[l.status] || { label: l.status, cls: 'text-content-muted bg-surface-overlay' };
                  return (
                    <li key={l.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      {l.channel === 'whatsapp'
                        ? <MessageCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600" aria-label="WhatsApp" />
                        : <Mail className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-label="Email" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-content-primary">
                          {EVENT_LABELS[l.event] || l.event}
                          {l.order_number && <span className="text-content-muted"> · #{l.order_number}</span>}
                        </p>
                        <p className="text-xs text-content-muted truncate">
                          {l.recipient} · {new Date(l.created_at).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                        {l.error && <p className="text-xs text-red-600 dark:text-red-400 truncate" title={l.error}>{l.error}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="bg-surface-raised border border-border-default rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Evolution API</p>
            <div>
              <label className={labelCls}>URL base</label>
              <input value={evolutionBaseUrl} onChange={e => setEvolutionBaseUrl(e.target.value)} placeholder="https://minha-evolution-api.com" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome da instância</label>
                <input value={evolutionInstance} onChange={e => setEvolutionInstance(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Chave da API</label>
                <input type="password" value={evolutionApiKey} onChange={e => setEvolutionApiKey(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="border border-border-default rounded-lg p-3 bg-surface-base">
              <p className="text-xs font-medium text-content-secondary mb-1">URL do webhook (colar na configuração da Evolution API)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-content-muted break-all">{webhookUrl}</code>
                <button onClick={copyWebhook} className="shrink-0 p-1.5 rounded-lg hover:bg-surface-overlay text-content-muted" title="Copiar">
                  {copied ? <Check className="w-4 h-4 text-brand-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button onClick={testConnection} disabled={testing || !authorizedNumbers.length}
              className="flex items-center gap-2 px-3 py-1.5 border border-border-default rounded-lg text-sm font-medium text-content-secondary hover:bg-surface-overlay disabled:opacity-50">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Testar Ligação
            </button>
            {!authorizedNumbers.length && <p className="text-xs text-content-muted">Adicione um número autorizado ao lado antes de testar.</p>}
          </div>

          <div className="space-y-4">
            <div className="bg-surface-raised border border-border-default rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Inteligência Artificial</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Fornecedor</label>
                  <select value={llmProvider} onChange={e => setLlmProvider(e.target.value as 'openai' | 'anthropic' | 'gemini')} className={inputCls}>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google (Gemini)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Chave da API</label>
                  <input type="password" value={llmApiKey} onChange={e => setLlmApiKey(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Modelo (opcional)</label>
                <input value={llmModel} onChange={e => setLlmModel(e.target.value)}
                  placeholder={llmProvider === 'openai' ? 'gpt-4o-mini' : llmProvider === 'gemini' ? 'gemini-3.6-flash' : 'claude-haiku-4-5-20251001'} className={inputCls} />
                <p className="text-xs text-content-muted mt-1">Deixe em branco para usar o modelo padrão.</p>
              </div>
            </div>

            <div className="bg-surface-raised border border-border-default rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Números Autorizados</p>
              <p className="text-xs text-content-muted">Só estes números podem falar com o assistente. Mensagens de qualquer outro número são ignoradas.</p>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 p-3 text-xs text-green-800 dark:text-green-300 space-y-1">
                <p className="font-semibold">Pagamentos M-Pesa / e-Mola</p>
                <p>Estes números recebem o aviso "💰 Pagamento a confirmar" sempre que um cliente envia o código da transação, e podem responder:</p>
                <p className="font-mono">CONFIRMAR NE-…  ·  REJEITAR NE-… motivo</p>
                <p>Também podem reencaminhar para aqui a SMS de confirmação que o comerciante recebe — o pedido com o mesmo código fica pago automaticamente.</p>
              </div>
              <div className="flex gap-2">
                <input value={newNumber} onChange={e => setNewNumber(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNumber()}
                  placeholder="258841234567" className={inputCls} />
                <button onClick={addNumber} className="shrink-0 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
              </div>
              <div className="space-y-1.5">
                {authorizedNumbers.map(n => (
                  <div key={n} className="flex items-center justify-between gap-2 border border-border-default rounded-lg px-3 py-2 text-sm">
                    <span className="text-content-primary">+{n}</span>
                    <button aria-label="Remover" onClick={() => setAuthorizedNumbers(prev => prev.filter(x => x !== n))} className="tap-target text-content-muted hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {authorizedNumbers.length === 0 && <p className="text-xs text-content-muted text-center py-4">Nenhum número autorizado ainda</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default AssistantSettings;
