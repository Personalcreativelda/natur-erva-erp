import React, { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../../core/components/layout/PageShell';
import api from '../../core/services/apiClient';
import { Bot, Loader2, Plus, X, Send, Copy, Check } from 'lucide-react';
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
    } catch (e: any) { showToast?.(e.message || 'Erro ao carregar configuração', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/assistant/config', {
        isEnabled, evolutionBaseUrl, evolutionInstance, evolutionApiKey,
        llmProvider, llmApiKey, llmModel: llmModel || undefined,
        authorizedNumbers,
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

  const addNumber = () => {
    const clean = newNumber.replace(/\D/g, '');
    if (!clean || authorizedNumbers.includes(clean)) return;
    setAuthorizedNumbers(prev => [...prev, clean]);
    setNewNumber('');
  };

  const webhookUrl = `${API_BASE}/assistant/webhook?secret=${webhookSecret}`;
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
                Nesta fase o assistente só responde a perguntas (stock, vendas, encomendas) — não altera nada no sistema.
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
                    <button onClick={() => setAuthorizedNumbers(prev => prev.filter(x => x !== n))} className="text-content-muted hover:text-red-600">
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
