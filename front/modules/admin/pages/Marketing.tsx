import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Send, Users, Mail, MessageCircle, Loader2, RefreshCw, ExternalLink, Paperclip, X as XIcon, Zap, Search, CheckCircle2, AlertCircle, Eye, ImageOff } from 'lucide-react';
import api from '../../core/services/apiClient';
import { PageShell } from '../../core/components/layout/PageShell';
import { SectionNav, useSectionNav } from '../../core/components/layout/SectionNav';
import { getSystemSettings } from '../../core/services/systemSettingsService';
import { FollowupAutomations } from '../components/marketing/FollowupAutomations';
import { ProductShowcasePicker, useShowcaseProducts, fmtMT } from '../components/marketing/ProductShowcasePicker';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  opted_out?: boolean;
  order_count: number;
  points: number;
}

interface Campaign {
  id: string;
  title: string;
  subject?: string;
  channel: 'email' | 'whatsapp';
  status?: string;
  recipient_count: number;
  sent_count?: number;
  failed_count?: number;
  created_by_name?: string;
  created_at: string;
}

interface WALink { name: string; phone: string; link: string }
interface Progress { campaignId: string; total: number; sent: number; failed: number; done: boolean; skipped: number }

type Tab = 'email' | 'whatsapp' | 'automations';

const OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber promoções._';

/** Modelos de mensagem para campanhas (servem para qualquer tipo de negócio). */
const WA_TEMPLATES = (store: string, site: string) => [
  { id: 'promo', label: 'Promoção', text: `Olá {nome}! 🔥 Esta semana há descontos especiais na ${store}.\n\nAproveite enquanto durar o stock:\n👉 ${site}` },
  { id: 'novidade', label: 'Novidade', text: `Olá {nome}! ✨ Acabou de chegar uma novidade à ${store} que achamos que vai gostar.\n\nVeja aqui: ${site}` },
  { id: 'cupao', label: 'Cupão', text: `Olá {nome}! 🎁 Temos um presente para si: use o cupão *BEMVINDO10* e receba 10% de desconto na próxima compra.\n\n👉 ${site}` },
  { id: 'stock', label: 'De volta ao stock', text: `Olá {nome}! O produto que procurava está de novo disponível na ${store}. As unidades são limitadas.\n\n👉 ${site}` },
  { id: 'obrigado', label: 'Agradecimento', text: `Olá {nome}! 💚 Obrigado por fazer parte da ${store}. A sua confiança é o que nos faz crescer.\n\nQualquer dúvida, estamos por aqui.` },
  { id: 'data', label: 'Data especial', text: `Olá {nome}! 🎉 Para celebrar esta data especial, preparámos ofertas exclusivas para clientes como si.\n\n👉 ${site}` },
];

const firstName = (name?: string) => {
  const f = String(name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
  return f.charAt(0).toLocaleUpperCase('pt') + f.slice(1).toLocaleLowerCase('pt');
};
const fmtPhone = (p?: string | null) => (p ? `+${p}` : 'Sem telemóvel');

export const Marketing: React.FC<{ showToast: (msg: string, type: 'success' | 'error' | 'info') => void }> = ({ showToast }) => {
  const [tab, setTab] = useState<Tab>('email');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState('');
  const [store, setStore] = useState({ name: 'a nossa loja', site: window.location.origin });

  // Email
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<{ filename: string; content: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [emailProductIds, setEmailProductIds] = useState<string[]>([]);
  const [emailPreview, setEmailPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // WhatsApp
  const [waReady, setWaReady] = useState<boolean | null>(null);
  const [waMessage, setWaMessage] = useState('');
  const [waLinks, setWaLinks] = useState<WALink[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [sendingWA, setSendingWA] = useState(false);
  const [waProductIds, setWaProductIds] = useState<string[]>([]);
  const allProducts = useShowcaseProducts();
  const waProducts = useMemo(() => waProductIds.map(id => allProducts?.find(p => p.id === id)).filter(Boolean) as NonNullable<typeof allProducts>, [waProductIds, allProducts]);
  const pollRef = useRef<number | null>(null);

  const loadCampaigns = () => api.get<Campaign[]>('/marketing/campaigns').then(setCampaigns).catch(() => {});

  useEffect(() => {
    getSystemSettings().then(s => {
      const name = String(s.company_name || '').replace(/\b(sociedade\s+unipessoal|limitada|lda\.?)(?=\s|,|$)/gi, '').replace(/[,\s]+$/g, '').trim();
      setStore({ name: name || 'a nossa loja', site: s.company_website || window.location.origin });
    }).catch(() => {});
    api.get<Customer[]>('/marketing/customers')
      .then(setCustomers)
      .catch(() => showToast('Erro ao carregar clientes', 'error'))
      .finally(() => setLoadingCustomers(false));
    api.get<{ ready: boolean }>('/marketing/whatsapp-status').then(r => setWaReady(r.ready)).catch(() => setWaReady(false));
    loadCampaigns();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const templates = useMemo(() => WA_TEMPLATES(store.name, store.site), [store]);
  useEffect(() => { if (!waMessage && templates.length) setWaMessage(templates[0].text); }, [templates]);

  // Lista de destinatários do canal activo
  const channelCustomers = useMemo(() => customers.filter(c => (tab === 'email' ? !!c.email : !!c.whatsapp)), [customers, tab]);
  const visibleCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channelCustomers;
    return channelCustomers.filter(c => `${c.name} ${c.email || ''} ${c.whatsapp || ''}`.toLowerCase().includes(q));
  }, [channelCustomers, query]);
  const optedOutCount = channelCustomers.filter(c => c.opted_out).length;

  const selectable = (c: Customer) => !(tab === 'whatsapp' && c.opted_out);
  const toggleCustomer = (id: string) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const recipientCount = sendToAll
    ? channelCustomers.filter(selectable).length
    : selectedIds.filter(id => channelCustomers.some(c => c.id === id && selectable(c))).length;

  const switchTab = (t: Tab) => { setTab(t); setQuery(''); };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setAttachments(prev => [...prev, { filename: file.name, content: String(ev.target?.result).split(',')[1] }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSendEmail = async () => {
    if (!subject.trim() || (!body.trim() && !emailProductIds.length)) return showToast('Escreva o assunto e a mensagem (ou escolha produtos)', 'error');
    if (!recipientCount) return showToast('Selecione pelo menos um destinatário', 'error');
    setSending(true);
    try {
      const r = await api.post<{ sent: number }>('/marketing/send-email', {
        subject, body, attachments, recipientIds: selectedIds, sendToAll,
        productIds: emailProductIds, productsTitle: emailProductIds.length ? 'Escolhidos para si' : undefined,
      });
      showToast(`Email enviado para ${r.sent} clientes`, 'success');
      setSubject(''); setBody(''); setSelectedIds([]); setSendToAll(false); setAttachments([]); setEmailProductIds([]); setEmailPreview(null);
      loadCampaigns();
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar campanha', 'error');
    } finally {
      setSending(false);
    }
  };

  const previewEmail = async () => {
    setPreviewing(true);
    try {
      const r = await api.post<{ html: string }>('/marketing/email-preview', {
        body, productIds: emailProductIds, productsTitle: emailProductIds.length ? 'Escolhidos para si' : undefined,
      });
      setEmailPreview(r.html);
    } catch (err: any) {
      showToast(err.message || 'Erro na pré-visualização', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const applyPromoEmailTemplate = () => {
    setSubject('Promoções da semana na ' + store.name);
    setBody('<h2>Olá {nome}!</h2><p>Seleccionámos algumas ofertas especiais para si. Os preços são por tempo limitado — aproveite!</p>');
    const promos = (allProducts || []).filter(p => p.isPromo).slice(0, 6).map(p => p.id);
    if (promos.length) setEmailProductIds(promos);
  };

  const pollCampaign = (campaignId: string, total: number, skipped: number) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const c = await api.get<{ status: string; sent_count: number; failed_count: number }>(`/marketing/campaigns/${campaignId}`);
        const done = c.status === 'sent' || c.status === 'failed';
        setProgress({ campaignId, total, skipped, sent: c.sent_count, failed: c.failed_count, done });
        if (done && pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; loadCampaigns(); }
      } catch { /* tenta de novo no próximo ciclo */ }
    };
    tick();
    pollRef.current = window.setInterval(tick, 3000);
  };

  const handleSendWA = async () => {
    if (!waMessage.trim()) return showToast('Mensagem obrigatória', 'error');
    if (!recipientCount) return showToast('Selecione pelo menos um destinatário', 'error');
    setSendingWA(true);
    setWaLinks([]); setProgress(null);
    try {
      const r = await api.post<any>('/marketing/whatsapp-send', { message: waMessage, recipientIds: selectedIds, sendToAll, productIds: waProductIds });
      if (r.mode === 'evolution') {
        const mins = Math.max(1, Math.round((r.estimatedSeconds || 0) / 60));
        showToast(`A enviar para ${r.total} clientes (~${mins} min). Pode sair desta página.`, 'success');
        pollCampaign(r.campaignId, r.total, r.skipped || 0);
        setSelectedIds([]); setSendToAll(false); setWaProductIds([]);
      } else {
        setWaLinks(r.links || []);
        showToast(`${r.count} links gerados — clique para enviar`, 'info');
      }
      loadCampaigns();
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar WhatsApp', 'error');
    } finally {
      setSendingWA(false);
    }
  };

  const previewName = firstName(customers.find(c => selectedIds.includes(c.id))?.name || channelCustomers[0]?.name);
  const previewText = waMessage.replace(/{nome}/gi, previewName).replace(/{nome_completo}/gi, previewName) + OPT_OUT_FOOTER;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const TABS: { id: Tab; label: string; icon: any; description: string }[] = [
    { id: 'email', label: 'Email', icon: Mail, description: 'Campanhas com montra de produtos' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Mensagens e fotos de produtos' },
    { id: 'automations', label: 'Automações', icon: Zap, description: 'Lembretes e follow-up automáticos' },
  ];
  const nav = useSectionNav(TABS, tab, switchTab);

  return (
    <PageShell title="Marketing" actions={
      <button onClick={() => setShowHistory(v => !v)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default text-content-secondary hover:bg-surface-raised text-sm">
        <RefreshCw className="w-4 h-4" /> Histórico
      </button>
    }>
      {showHistory && (
        <div className="mb-6 bg-surface-overlay rounded-xl border border-border-default overflow-hidden">
          <div className="px-4 py-3 border-b border-border-default font-semibold text-content-primary text-sm">Campanhas enviadas</div>
          {campaigns.length === 0 ? (
            <p className="p-4 text-content-muted text-sm">Nenhuma campanha enviada ainda.</p>
          ) : campaigns.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-4 py-3 border-b border-border-default last:border-0">
              <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${c.channel === 'email' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600'}`}>
                {c.channel === 'email' ? <Mail className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content-primary truncate">{c.title}</p>
                <p className="text-xs text-content-muted">
                  {c.channel === 'whatsapp' && c.status !== 'links'
                    ? `${c.sent_count ?? 0}/${c.recipient_count} enviadas${c.failed_count ? ` · ${c.failed_count} falharam` : ''}${c.status === 'sending' ? ' · a enviar…' : ''}`
                    : `${c.recipient_count} destinatários`}
                  {c.created_by_name ? ` · ${c.created_by_name}` : ''}
                </p>
              </div>
              <span className="text-xs text-content-muted whitespace-nowrap">{fmtDate(c.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6"><SectionNav nav={nav} card={nav.isMobile} /></div>

      {!nav.listMode && (tab === 'automations' ? (
        <FollowupAutomations showToast={showToast} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Destinatários */}
          <div className="lg:col-span-2 bg-surface-raised rounded-xl border border-border-default overflow-hidden">
            <div className="px-4 py-3 border-b border-border-default flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-content-primary text-sm">
                <Users className="w-4 h-4" /> Destinatários
                {recipientCount > 0 && <span className="bg-brand-600 text-white text-xs rounded-full px-2 py-0.5">{recipientCount}</span>}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary cursor-pointer">
                <input type="checkbox" checked={sendToAll} onChange={e => { setSendToAll(e.target.checked); setSelectedIds([]); }} className="accent-brand-600 w-4 h-4" />
                Todos ({channelCustomers.filter(selectable).length})
              </label>
            </div>
            <div className="px-3 py-2 border-b border-border-default">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" aria-hidden="true" />
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar cliente…" aria-label="Pesquisar cliente"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border-default bg-surface-base text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              {tab === 'whatsapp' && optedOutCount > 0 && (
                <p className="mt-1.5 text-xs text-content-muted">{optedOutCount} cliente(s) responderam SAIR e não recebem promoções.</p>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border-default">
              {loadingCustomers ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-content-muted" /></div>
              ) : visibleCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-content-muted">{tab === 'email' ? 'Nenhum cliente com email.' : 'Nenhum cliente com telemóvel.'}</p>
              ) : visibleCustomers.map(c => {
                const blocked = !selectable(c);
                return (
                  <label key={c.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-overlay/50 ${sendToAll || blocked ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="checkbox" checked={!blocked && (sendToAll || selectedIds.includes(c.id))} onChange={() => toggleCustomer(c.id)} disabled={blocked} className="accent-brand-600 flex-shrink-0 w-4 h-4" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary truncate">{c.name}</p>
                      <p className="text-xs text-content-muted truncate">{tab === 'email' ? c.email : fmtPhone(c.whatsapp)}</p>
                    </div>
                    {blocked
                      ? <span className="text-[11px] rounded-full bg-surface-overlay px-2 py-0.5 text-content-muted whitespace-nowrap">Saiu</span>
                      : <span className="text-xs text-content-muted whitespace-nowrap">{c.order_count} {c.order_count === 1 ? 'pedido' : 'pedidos'}</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Formulário */}
          <div className="lg:col-span-3 space-y-4">
            {tab === 'email' ? (
              <div className="bg-surface-raised rounded-xl border border-border-default p-5 space-y-4">
                <h3 className="font-semibold text-content-primary flex items-center gap-2"><Mail className="w-4 h-4" /> Compor email</h3>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Assunto</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex.: Novidades exclusivas para si"
                    className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-base text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Mensagem (HTML ou texto simples)</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="<h2>Olá {nome}!</h2><p>Temos novidades especiais...</p>"
                    className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-base text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y font-mono" />
                  <p className="text-xs text-content-muted mt-1">Pode usar HTML e {'{nome}'} para personalizar.</p>
                </div>
                <ProductShowcasePicker selected={emailProductIds} onChange={ids => { setEmailProductIds(ids); setEmailPreview(null); }} max={8}
                  hint="Os produtos aparecem no fim do email em cartões com foto, preço (antigo riscado nas promoções) e botão Comprar." />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={applyPromoEmailTemplate}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-overlay">
                    Modelo: Promoções da semana
                  </button>
                  <button type="button" onClick={previewEmail} disabled={previewing || (!body.trim() && !emailProductIds.length)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-overlay disabled:opacity-50">
                    {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Pré-visualizar email
                  </button>
                </div>
                {emailPreview && (
                  <div className="overflow-hidden rounded-xl border border-border-default">
                    <div className="flex items-center justify-between border-b border-border-default bg-surface-base px-3 py-1.5 text-xs text-content-muted">
                      <span>Pré-visualização (com o nome de exemplo "Ana")</span>
                      <button type="button" onClick={() => setEmailPreview(null)} aria-label="Fechar pré-visualização" className="hover:text-content-primary"><XIcon className="h-4 w-4" /></button>
                    </div>
                    <iframe title="Pré-visualização do email" srcDoc={emailPreview} sandbox="" className="h-[520px] w-full bg-white" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">Anexos (opcional)</label>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-base rounded-lg border border-border-default text-xs text-content-primary">
                        <Paperclip className="w-3 h-3 text-content-muted flex-shrink-0" />
                        <span className="max-w-[120px] truncate">{a.filename}</span>
                        <button aria-label="Remover" type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-content-muted hover:text-red-500 ml-0.5">
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-border-default rounded-lg text-xs text-content-muted cursor-pointer hover:border-brand-500 hover:text-brand-600 transition-colors">
                      <Paperclip className="w-3 h-3" /> Adicionar ficheiro
                      <input type="file" multiple className="hidden" onChange={handleAttachment} />
                    </label>
                  </div>
                </div>
                <button onClick={handleSendEmail} disabled={sending || recipientCount === 0}
                  className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> A enviar…</> : <><Send className="w-4 h-4" /> Enviar para {recipientCount} clientes</>}
                </button>
              </div>
            ) : (
              <div className="bg-surface-raised rounded-xl border border-border-default p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-content-primary flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Mensagem WhatsApp</h3>
                  {waReady !== null && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${waReady ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {waReady ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {waReady ? 'Evolution API ligada' : 'Sem Evolution — gera links'}
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-content-secondary mb-1.5">Modelos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map(t => (
                      <button key={t.id} type="button" onClick={() => setWaMessage(t.text)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${waMessage === t.text ? 'border-brand-600 bg-brand-600/10 text-brand-700 dark:text-brand-300' : 'border-border-default text-content-secondary hover:border-brand-500'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="wa-message" className="block text-xs font-medium text-content-secondary mb-1">
                    Mensagem <span className="text-content-muted">({'{nome}'} = primeiro nome · *negrito* · _itálico_)</span>
                  </label>
                  <textarea id="wa-message" value={waMessage} onChange={e => setWaMessage(e.target.value)} rows={6} maxLength={3000}
                    className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-base text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y" />
                  <p className="text-right text-[11px] text-content-muted tabular-nums">{waMessage.length}/3000</p>
                </div>

                <ProductShowcasePicker selected={waProductIds} onChange={setWaProductIds} max={4}
                  hint="Cada produto segue logo a seguir à mensagem, como foto com o nome, o preço e o link de compra." />

                <div>
                  <p className="text-xs font-medium text-content-secondary mb-1.5">Pré-visualização</p>
                  <div className="rounded-xl bg-[#efeae2] dark:bg-[#0b141a] p-3">
                    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm">
                      <p className="whitespace-pre-wrap break-words">{previewText}</p>
                    </div>
                    {waProducts.map(p => (
                      <div key={p.id} className="ml-auto mt-2 w-[70%] max-w-[260px] overflow-hidden rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] p-1 shadow-sm">
                        <div className="flex h-36 items-center justify-center rounded-md bg-white">
                          {p.image ? <img src={p.image} alt="" className="h-full w-full object-contain" /> : <ImageOff className="h-6 w-6 text-gray-400" aria-hidden="true" />}
                        </div>
                        <div className="px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100">
                          <p className="font-semibold leading-tight">{p.name}</p>
                          <p>
                            {p.isPromo && <span className="mr-1 text-gray-500 line-through">{fmtMT(p.price)}</span>}
                            <strong>{fmtMT(p.isPromo ? (p.promoPrice as number) : p.price)}</strong>
                            {p.isPromo && p.discountPercent > 0 && ` (-${p.discountPercent}%)`}
                          </p>
                          <p className="truncate text-xs text-sky-700 dark:text-sky-300">🛒 {p.url}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-content-muted">A linha "Responda SAIR…" é acrescentada automaticamente — quem responder SAIR deixa de receber promoções.</p>
                </div>

                <button onClick={handleSendWA} disabled={sendingWA || recipientCount === 0 || (progress !== null && !progress.done)}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {sendingWA ? <><Loader2 className="w-4 h-4 animate-spin" /> A preparar…</> : <><MessageCircle className="w-4 h-4" /> Enviar para {recipientCount} clientes</>}
                </button>
                {waReady && recipientCount > 0 && !progress && (
                  <p className="-mt-2 text-center text-xs text-content-muted">
                    Para proteger o número, as mensagens saem com uma pausa (~{Math.max(1, Math.round(recipientCount * 6.5 / 60))} min no total).
                  </p>
                )}

                {progress && (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${progress.done ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-border-default bg-surface-base'}`} aria-live="polite">
                    <div className="flex items-center justify-between gap-2 text-content-primary">
                      <span className="inline-flex items-center gap-2 font-medium">
                        {progress.done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                        {progress.done ? 'Campanha concluída' : 'A enviar…'}
                      </span>
                      <span className="tabular-nums text-content-muted">{progress.sent + progress.failed}/{progress.total}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-surface-overlay overflow-hidden">
                      <div className="h-full bg-green-600 transition-all" style={{ width: `${progress.total ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-content-muted">
                      {progress.sent} enviadas{progress.failed ? ` · ${progress.failed} sem WhatsApp ou falharam` : ''}{progress.skipped ? ` · ${progress.skipped} ignorados (SAIR)` : ''}
                    </p>
                  </div>
                )}

                {waLinks.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-xs font-medium text-content-secondary">Clique em cada link para abrir o WhatsApp:</p>
                    {waLinks.map((l, i) => (
                      <a key={i} href={l.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border-default hover:bg-surface-overlay/50 transition-colors group">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {l.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-content-primary">{l.name}</p>
                          <p className="text-xs text-content-muted">+{l.phone}</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-content-muted group-hover:text-green-600 transition-colors" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </PageShell>
  );
};

export default Marketing;
