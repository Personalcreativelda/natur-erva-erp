import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ProductCategory, ProductUnit, VariantTemplate, Product } from '../../../core/types/types';
import { useProducts } from '../../../core/hooks/useProducts';
import { Plus, Edit2, Trash2, Save, X, Tag, Ruler, Layers, CheckCircle, Upload, Search } from 'lucide-react';
import { Toast } from '../../../core/components/ui/Toast';
import { ConfirmDialog } from '../../../core/components/ui/ConfirmDialog';

type ProductManagementTabType = 'categories' | 'units' | 'templates';

interface ProductManagementProps {
 showToast: (message: string, type?: Toast['type'], duration?: number) => void;
 onDataChanged?: () => void; // Callback para notificar mudanças
 defaultTab?: ProductManagementTabType;
 /** Lista de produtos (opcional) — para mostrar quantos produtos tem cada categoria */
 products?: Product[];
}

/** Categoria tal como vem da API (o tipo ProductCategory dos types é um enum, não serve aqui) */
interface CategoryItem {
 id: string;
 name: string;
 description?: string;
 color?: string;
 icon?: string;
 imageUrl?: string;
 isActive?: boolean;
}

/** Paleta rápida de cores para categorias */
const CATEGORY_COLORS = ['#16A34A', '#65A30D', '#0D9488', '#0EA5E9', '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#CA8A04', '#78716C', '#334155'];

/** Descrições vêm com marcação (*Exemplos:* * item) — no resumo mostramos texto limpo */
const cleanDescription = (text?: string) => (text || '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

export const ProductManagement: React.FC<ProductManagementProps> = ({ showToast, onDataChanged, defaultTab = 'categories', products }) => {
 const [activeTab, setActiveTab] = useState<ProductManagementTabType>(defaultTab);

 // Hook do módulo produtos
 const {
 categories,
 units,
 templates,
 getCategories,
 getUnits,
 getVariantTemplates,
 addCategory,
 updateCategory,
 deleteCategory,
 addUnit,
 updateUnit,
 deleteUnit,
 addVariantTemplate,
 updateVariantTemplate,
 deleteVariantTemplate,
 loading
 } = useProducts();

 // Editing states
 const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
 const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#3B82F6', icon: '', imageUrl: '' });
 const [pendingImageData, setPendingImageData] = useState<string | null>(null);
 const [categorySheetOpen, setCategorySheetOpen] = useState(false);
 const [categorySearch, setCategorySearch] = useState('');

 const emptyCategoryForm = { name: '', description: '', color: '#16A34A', icon: '', imageUrl: '' };

 /** Nº de produtos por categoria (se a página passar a lista de produtos) */
 const categoryProductCounts = React.useMemo(() => {
 const map = new Map<string, number>();
 (products || []).forEach(p => {
 const key = (p.category || '').toLowerCase();
 if (key) map.set(key, (map.get(key) || 0) + 1);
 });
 return map;
 }, [products]);

 const openCategorySheet = (category: CategoryItem | null) => {
 setEditingCategory(category);
 setPendingImageData(null);
 setCategoryForm(category ? {
 name: category.name,
 description: category.description || '',
 color: category.color || '#16A34A',
 icon: category.icon || '',
 imageUrl: (category as any).imageUrl || ''
 } : emptyCategoryForm);
 setCategorySheetOpen(true);
 };

 // Painel aberto: Esc fecha e a página por trás não desliza
 useEffect(() => {
 if (!categorySheetOpen) return;
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCategorySheet(); };
 document.addEventListener('keydown', onKey);
 const prev = document.body.style.overflow;
 document.body.style.overflow = 'hidden';
 return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [categorySheetOpen]);

 const closeCategorySheet = () => {
 setCategorySheetOpen(false);
 setEditingCategory(null);
 setPendingImageData(null);
 setCategoryForm(emptyCategoryForm);
 };

 const toggleCategoryActive = async (category: CategoryItem) => {
 const ok = await updateCategory(category.id, ({
 name: category.name,
 description: category.description,
 color: category.color,
 icon: category.icon,
 isActive: !category.isActive
 }) as any);
 if (ok) {
 showToast(category.isActive ? `"${category.name}" deixou de aparecer na loja` : `"${category.name}" voltou a aparecer na loja`, 'success');
 onDataChanged?.();
 } else {
 showToast('Erro ao actualizar a categoria', 'error');
 }
 };

 const [editingUnit, setEditingUnit] = useState<ProductUnit | null>(null);
 const [unitForm, setUnitForm] = useState({ name: '', abbreviation: '', description: '' });

 const [editingTemplate, setEditingTemplate] = useState<VariantTemplate | null>(null);
 const [templateForm, setTemplateForm] = useState({ name: '', description: '', values: [''] });

 // Confirmation Dialog
 const [confirmDialog, setConfirmDialog] = useState<{
 isOpen: boolean;
 message: string;
 onConfirm: () => void;
 variant?: 'danger' | 'warning' | 'info';
 }>({
 isOpen: false,
 message: '',
 onConfirm: () => { },
 variant: 'warning'
 });

 useEffect(() => {
 loadData();
 }, [activeTab, getCategories, getUnits, getVariantTemplates]);

 const loadData = async () => {
 try {
 if (activeTab === 'categories') {
 await getCategories();
 } else if (activeTab === 'units') {
 await getUnits();
 } else if (activeTab === 'templates') {
 await getVariantTemplates();
 }
 } catch (error) {
 showToast('Erro ao carregar dados', 'error');
 }
 };

 // Categories
 const handleSaveCategory = async () => {
 if (!categoryForm.name.trim()) {
 showToast('Nome da categoria é obrigatório', 'error');
 return;
 }

 try {
 if (editingCategory) {
 const payload: any = {
 name: categoryForm.name,
 description: categoryForm.description,
 color: categoryForm.color,
 icon: categoryForm.icon,
 isActive: editingCategory.isActive
 };
 if (pendingImageData) payload.imageData = pendingImageData;
 const success = await updateCategory(editingCategory.id, payload);
 if (success) {
 showToast('Categoria actualizada', 'success');
 closeCategorySheet();
 onDataChanged?.();
 } else {
 showToast('Erro ao atualizar categoria', 'error');
 }
 } else {
 const payload: any = {
 name: categoryForm.name,
 description: categoryForm.description,
 color: categoryForm.color,
 icon: categoryForm.icon,
 isActive: true
 };
 if (pendingImageData) payload.imageData = pendingImageData;
 const newCategory = await addCategory(payload);
 if (newCategory) {
 showToast('Categoria criada', 'success');
 closeCategorySheet();
 onDataChanged?.();
 } else {
 showToast('Erro ao criar categoria', 'error');
 }
 }
 } catch (error) {
 showToast('Erro ao salvar categoria', 'error');
 }
 };

 const handleDeleteCategory = (id: string) => {
 setConfirmDialog({
 isOpen: true,
 message: 'Os produtos desta categoria ficam sem categoria. Esta acção não pode ser desfeita.',
 variant: 'danger',
 onConfirm: async () => {
 try {
 const success = await deleteCategory(id);
 if (success) {
 showToast('Categoria apagada com sucesso', 'success');
 onDataChanged?.();
 } else {
 showToast('Erro ao apagar categoria', 'error');
 }
 } catch (error) {
 showToast('Erro ao apagar categoria', 'error');
 }
 setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } });
 }
 });
 };

 // Units
 const handleSaveUnit = async () => {
 if (!unitForm.name.trim() || !unitForm.abbreviation.trim()) {
 showToast('Nome e abreviação são obrigatórios', 'error');
 return;
 }

 try {
 if (editingUnit) {
 const success = await updateUnit(editingUnit.id, {
 name: unitForm.name,
 abbreviation: unitForm.abbreviation,
 description: unitForm.description,
 isActive: editingUnit.isActive
 });
 if (success) {
 showToast('Unidade atualizada com sucesso', 'success');
 setEditingUnit(null);
 setUnitForm({ name: '', abbreviation: '', description: '' });
 onDataChanged?.();
 } else {
 showToast('Erro ao atualizar unidade', 'error');
 }
 } else {
 const newUnit = await addUnit({
 name: unitForm.name,
 abbreviation: unitForm.abbreviation,
 description: unitForm.description,
 isActive: true
 });
 if (newUnit) {
 showToast('Unidade criada com sucesso', 'success');
 setUnitForm({ name: '', abbreviation: '', description: '' });
 onDataChanged?.();
 } else {
 showToast('Erro ao criar unidade', 'error');
 }
 }
 } catch (error) {
 showToast('Erro ao salvar unidade', 'error');
 }
 };

 const handleDeleteUnit = (id: string) => {
 setConfirmDialog({
 isOpen: true,
 message: 'Tem certeza que deseja apagar esta unidade?',
 variant: 'danger',
 onConfirm: async () => {
 try {
 const success = await deleteUnit(id);
 if (success) {
 showToast('Unidade apagada com sucesso', 'success');
 onDataChanged?.();
 } else {
 showToast('Erro ao apagar unidade', 'error');
 }
 } catch (error) {
 showToast('Erro ao apagar unidade', 'error');
 }
 setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } });
 }
 });
 };

 // Templates
 const handleSaveTemplate = async () => {
 if (!templateForm.name.trim()) {
 showToast('Nome do template é obrigatório', 'error');
 return;
 }

 const values = templateForm.values.filter(v => v.trim() !== '');
 if (values.length === 0) {
 showToast('Adicione pelo menos um valor', 'error');
 return;
 }

 try {
 if (editingTemplate) {
 const success = await updateVariantTemplate(editingTemplate.id, {
 name: templateForm.name,
 description: templateForm.description,
 values,
 isActive: editingTemplate.isActive
 });
 if (success) {
 showToast('Template atualizado com sucesso', 'success');
 setEditingTemplate(null);
 setTemplateForm({ name: '', description: '', values: [''] });
 onDataChanged?.();
 } else {
 showToast('Erro ao atualizar template', 'error');
 }
 } else {
 const newTemplate = await addVariantTemplate({
 name: templateForm.name,
 description: templateForm.description,
 values,
 isActive: true
 });
 if (newTemplate) {
 showToast('Template criado com sucesso', 'success');
 setTemplateForm({ name: '', description: '', values: [''] });
 onDataChanged?.();
 } else {
 showToast('Erro ao criar template', 'error');
 }
 }
 } catch (error) {
 showToast('Erro ao salvar template', 'error');
 }
 };

 const handleDeleteTemplate = (id: string) => {
 setConfirmDialog({
 isOpen: true,
 message: 'Tem certeza que deseja apagar este template?',
 variant: 'danger',
 onConfirm: async () => {
 try {
 const success = await deleteVariantTemplate(id);
 if (success) {
 showToast('Template apagado com sucesso', 'success');
 onDataChanged?.();
 } else {
 showToast('Erro ao apagar template', 'error');
 }
 } catch (error) {
 showToast('Erro ao apagar template', 'error');
 }
 setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } });
 }
 });
 };

 const addTemplateValue = () => {
 setTemplateForm({ ...templateForm, values: [...templateForm.values, ''] });
 };

 const removeTemplateValue = (index: number) => {
 setTemplateForm({
 ...templateForm,
 values: templateForm.values.filter((_, i) => i !== index)
 });
 };

 const updateTemplateValue = (index: number, value: string) => {
 const newValues = [...templateForm.values];
 newValues[index] = value;
 setTemplateForm({ ...templateForm, values: newValues });
 };

 return (
 <div className="space-y-4 sm:space-y-6">
 {/* Seletor de separadores */}
 <div className="inline-flex p-1 rounded-xl bg-surface-base border border-border-default" role="tablist" aria-label="Gestão de produtos">
 {([['categories', 'Categorias', Tag], ['units', 'Unidades', Ruler], ['templates', 'Modelos', Layers]] as const).map(([id, label, Icon]) => (
 <button
 key={id}
 role="tab"
 aria-selected={activeTab === id}
 onClick={() => setActiveTab(id)}
 className={`h-9 !min-h-0 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === id ? 'bg-surface-raised text-content-primary shadow-sm' : 'text-content-muted hover:text-content-primary'}`}
 >
 <Icon className="w-4 h-4" /> {label}
 </button>
 ))}
 </div>

 {/* Categories Tab */}
 {activeTab === 'categories' && (() => {
 const term = categorySearch.trim().toLowerCase();
 const allCategories = categories as unknown as CategoryItem[];
 const list = allCategories.filter(c => !term || c.name.toLowerCase().includes(term) || (c.description || '').toLowerCase().includes(term));
 return (
 <div className="space-y-3 sm:space-y-4">
 {/* Barra: pesquisa + nova categoria */}
 <div className="flex items-center gap-2 sm:gap-3">
 <div className="relative flex-1 min-w-0 sm:max-w-sm">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
 <input
 type="search"
 value={categorySearch}
 onChange={e => setCategorySearch(e.target.value)}
 placeholder="Pesquisar categorias"
 aria-label="Pesquisar categorias"
 className="w-full h-11 pl-9 pr-3 rounded-xl border border-border-default bg-surface-raised text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
 />
 </div>
 <span className="hidden sm:inline text-sm text-content-muted tabular-nums">{list.length} de {allCategories.length}</span>
 <button
 onClick={() => openCategorySheet(null)}
 className="ml-auto shrink-0 h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
 >
 <Plus className="w-4 h-4" />
 <span className="hidden sm:inline">Nova categoria</span>
 <span className="sm:hidden">Nova</span>
 </button>
 </div>

 {loading && allCategories.length === 0 ? (
 <div className="space-y-2">
 {[0, 1, 2, 3].map(i => <div key={i} className="h-[72px] rounded-2xl bg-surface-raised border border-border-default animate-pulse" />)}
 </div>
 ) : list.length === 0 ? (
 <div className="rounded-2xl border border-dashed border-border-default bg-surface-raised py-12 px-6 text-center">
 <span className="mx-auto mb-3 w-12 h-12 rounded-full bg-brand-600/10 text-brand-600 flex items-center justify-center"><Tag className="w-6 h-6" /></span>
 <p className="font-semibold text-content-primary">{term ? 'Nenhuma categoria encontrada' : 'Ainda não há categorias'}</p>
 <p className="text-sm text-content-muted mt-1">{term ? 'Experimente outro termo de pesquisa.' : 'Crie a primeira para organizar os produtos na loja.'}</p>
 </div>
 ) : (
 <div className="rounded-2xl border border-border-default bg-surface-raised overflow-hidden">
 {/* Cabeçalho (desktop) */}
 <div className="hidden md:grid grid-cols-[minmax(0,1fr)_110px_120px_96px] gap-4 px-4 py-2.5 bg-surface-base border-b border-border-default text-xs font-semibold text-content-muted">
 <span>Categoria</span>
 <span className="text-right">Produtos</span>
 <span>Na loja</span>
 <span className="text-right">Ações</span>
 </div>
 <ul className="divide-y divide-border-default">
 {list.map(category => {
 const img = (category as any).imageUrl as string | undefined;
 const count = categoryProductCounts.get(category.name.toLowerCase()) || 0;
 return (
 <li key={category.id} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_110px_120px_96px] items-center gap-x-3 md:gap-4 px-3 sm:px-4 py-3 hover:bg-surface-base/50 transition-colors">
 {/* Categoria: imagem/cor + nome + descrição */}
 <button
 type="button"
 onClick={() => openCategorySheet(category)}
 className="flex items-center gap-3 min-w-0 text-left !min-h-0"
 >
 <span
 className="shrink-0 w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center border border-border-default"
 style={img ? undefined : { backgroundColor: category.color || '#3B82F6' }}
 >
 {img ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Tag className="w-5 h-5 text-white" />}
 </span>
 <span className="min-w-0">
 <span className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color || '#3B82F6' }} aria-hidden="true" />
 <span className="font-semibold text-sm text-content-primary truncate">{category.name}</span>
 </span>
 <span className="block text-xs text-content-muted mt-0.5 line-clamp-1 md:line-clamp-1">
 {cleanDescription(category.description) || 'Sem descrição'}
 </span>
 <span className="md:hidden flex items-center gap-2 mt-1 text-[11px]">
 <span className="text-content-muted">{count} {count === 1 ? 'produto' : 'produtos'}</span>
 <span className={`px-1.5 rounded-full font-medium ${category.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-surface-base text-content-muted'}`}>
 {category.isActive ? 'Ativa' : 'Inativa'}
 </span>
 </span>
 </span>
 </button>

 <span className="hidden md:block text-right text-sm tabular-nums text-content-secondary">{count}</span>

 {/* Interruptor ativa/inativa (desktop) */}
 <label className="hidden md:inline-flex items-center gap-2 cursor-pointer select-none">
 <input type="checkbox" className="sr-only peer" checked={!!category.isActive} onChange={() => toggleCategoryActive(category)} />
 <span className="relative w-10 h-6 rounded-full bg-border-strong peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
 <span className="text-xs text-content-muted">{category.isActive ? 'Ativa' : 'Inativa'}</span>
 </label>

 {/* Ações */}
 <div className="flex items-center justify-end gap-1">
 <button
 onClick={() => openCategorySheet(category)}
 className="w-10 h-10 !min-h-0 inline-flex items-center justify-center rounded-xl text-content-secondary hover:bg-surface-base hover:text-brand-600 transition-colors"
 title="Editar" aria-label={`Editar ${category.name}`}
 >
 <Edit2 className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleDeleteCategory(category.id)}
 className="w-10 h-10 !min-h-0 inline-flex items-center justify-center rounded-xl text-content-muted hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
 title="Eliminar" aria-label={`Eliminar ${category.name}`}
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </li>
 );
 })}
 </ul>
 </div>
 )}

 {/* Painel de criar/editar — lateral no desktop, folha inferior no mobile */}
 {categorySheetOpen && createPortal(
 <div className="fixed inset-0 z-[10030] flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-label={editingCategory ? 'Editar categoria' : 'Nova categoria'}>
 <div className="absolute inset-0 modal-overlay" onClick={closeCategorySheet} />
 <div className="relative w-full md:w-[440px] max-h-[92dvh] md:max-h-none md:h-full bg-surface-raised rounded-t-3xl md:rounded-none md:rounded-l-3xl shadow-2xl flex flex-col animate-sheet-panel">
 <div className="flex items-center justify-between gap-3 px-5 h-16 border-b border-border-default shrink-0">
 <h3 className="text-lg font-semibold text-content-primary">{editingCategory ? 'Editar categoria' : 'Nova categoria'}</h3>
 <button onClick={closeCategorySheet} className="w-10 h-10 !min-h-0 flex items-center justify-center rounded-full text-content-muted hover:bg-surface-base" aria-label="Fechar">
 <X className="w-5 h-5" />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
 {/* Imagem */}
 <div className="flex items-center gap-4">
 <div
 className="relative shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-border-default flex items-center justify-center"
 style={pendingImageData || categoryForm.imageUrl ? undefined : { backgroundColor: categoryForm.color || '#3B82F6' }}
 >
 {pendingImageData || categoryForm.imageUrl
 ? <img src={pendingImageData || categoryForm.imageUrl} alt="" className="w-full h-full object-cover" />
 : <Tag className="w-8 h-8 text-white" />}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-medium text-content-primary">Imagem da categoria</p>
 <p className="text-xs text-content-muted mt-0.5">Aparece nos círculos e cartões da loja. Sem imagem, a loja usa a foto do produto mais vendido.</p>
 <div className="flex flex-wrap gap-2 mt-2">
 <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-default text-sm font-medium text-content-secondary hover:bg-surface-base cursor-pointer">
 <Upload className="w-4 h-4" />
 {pendingImageData || categoryForm.imageUrl ? 'Trocar' : 'Carregar'}
 <input
 type="file"
 accept="image/*"
 className="hidden"
 onChange={(e) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = (ev) => setPendingImageData(ev.target?.result as string);
 reader.readAsDataURL(file);
 e.target.value = '';
 }}
 />
 </label>
 {(pendingImageData || categoryForm.imageUrl) && (
 <button
 type="button"
 onClick={() => { setPendingImageData(null); setCategoryForm(f => ({ ...f, imageUrl: '' })); }}
 className="h-9 px-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
 >
 Remover
 </button>
 )}
 </div>
 </div>
 </div>

 <div>
 <label htmlFor="cat-name" className="block text-sm font-medium text-content-primary mb-1.5">Nome *</label>
 <input
 id="cat-name"
 type="text"
 value={categoryForm.name}
 onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
 className="w-full h-11 px-3.5 rounded-xl border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
 placeholder="Ex.: Chás e Infusões"
 autoFocus
 />
 </div>

 <div>
 <label htmlFor="cat-desc" className="block text-sm font-medium text-content-primary mb-1.5">Descrição</label>
 <textarea
 id="cat-desc"
 value={categoryForm.description}
 onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
 className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-base text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
 rows={4}
 placeholder="Opcional — aparece na página da categoria"
 />
 </div>

 <div>
 <span className="block text-sm font-medium text-content-primary mb-2">Cor</span>
 <div className="flex flex-wrap items-center gap-2">
 {CATEGORY_COLORS.map(c => (
 <button
 key={c}
 type="button"
 onClick={() => setCategoryForm({ ...categoryForm, color: c })}
 className={`w-8 h-8 !min-h-0 rounded-full border-2 transition-transform ${categoryForm.color.toLowerCase() === c.toLowerCase() ? 'border-content-primary scale-110' : 'border-transparent'}`}
 style={{ backgroundColor: c }}
 aria-label={`Cor ${c}`}
 />
 ))}
 <label className="relative w-8 h-8 rounded-full border-2 border-dashed border-border-strong flex items-center justify-center cursor-pointer text-content-muted" title="Outra cor">
 <Plus className="w-4 h-4" />
 <input type="color" value={categoryForm.color} onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
 </label>
 <span className="ml-1 text-xs font-mono text-content-muted uppercase">{categoryForm.color}</span>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3 px-5 py-4 border-t border-border-default shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
 <button onClick={closeCategorySheet} className="h-11 rounded-xl border border-border-default text-sm font-semibold text-content-secondary hover:bg-surface-base">
 Cancelar
 </button>
 <button onClick={handleSaveCategory} disabled={!categoryForm.name.trim()} className="h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
 <Save className="w-4 h-4" /> {editingCategory ? 'Guardar' : 'Criar categoria'}
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}
 </div>
 );
 })()}

 {/* Units Tab */}
 {activeTab === 'units' && (
 <div className="space-y-4">
 {/* Form */}
 <div className="bg-surface-raised rounded-lg p-4 border border-border-default">
 <h3 className="font-semibold text-content-primary mb-4">
 {editingUnit ? 'Editar Unidade' : 'Nova Unidade'}
 </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 Nome *
 </label>
 <input
 type="text"
 value={unitForm.name}
 onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
 className="w-full px-3 py-2 border border-border-default rounded-lg "
 placeholder="Ex: Quilograma, Grama, Litro"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 Abreviação *
 </label>
 <input
 type="text"
 value={unitForm.abbreviation}
 onChange={(e) => setUnitForm({ ...unitForm, abbreviation: e.target.value.toUpperCase() })}
 className="w-full px-3 py-2 border border-border-default rounded-lg "
 placeholder="Ex: kg, g, ml, l, un"
 />
 </div>
 <div className="md:col-span-2">
 <label className="block text-sm font-medium text-content-secondary mb-1">
 Descrição
 </label>
 <textarea
 value={unitForm.description}
 onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })}
 className="w-full px-3 py-2 border border-border-default rounded-lg "
 rows={2}
 placeholder="Descrição opcional da unidade"
 />
 </div>
 </div>
 <div className="flex justify-end gap-2 mt-4">
 {editingUnit && (
 <button
 onClick={() => {
 setEditingUnit(null);
 setUnitForm({ name: '', abbreviation: '', description: '' });
 }}
 className="px-4 py-2 text-content-secondary hover:bg-surface-base rounded-lg"
 >
 <X className="w-4 h-4 inline mr-1" /> Cancelar
 </button>
 )}
 <button
 onClick={handleSaveUnit}
 className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center gap-2"
 >
 <Save className="w-4 h-4" /> {editingUnit ? 'Atualizar' : 'Criar'}
 </button>
 </div>
 </div>

 {/* List */}
 <div className="bg-surface-raised rounded-lg border border-border-default overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-surface-base">
 <tr>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Nome</th>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Abreviação</th>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Descrição</th>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Status</th>
 <th className="px-4 py-3 text-right text-xs font-semibold text-content-secondary">Ações</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
 {units.map(unit => (
 <tr key={unit.id} className="hover:bg-surface-base/50">
 <td className="px-4 py-3 text-sm font-medium text-content-primary">{unit.name}</td>
 <td className="px-4 py-3 text-sm text-content-primary font-mono">{unit.abbreviation}</td>
 <td className="px-4 py-3 text-sm text-content-muted">{unit.description || '-'}</td>
 <td className="px-4 py-3">
 <span className={`px-2 py-1 rounded text-xs ${unit.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-surface-base text-content-primary '}`}>
 {unit.isActive ? 'Ativa' : 'Inativa'}
 </span>
 </td>
 <td className="px-4 py-3 text-right">
 <div className="flex justify-end gap-2">
 <button
 onClick={() => {
 setEditingUnit(unit);
 setUnitForm({
 name: unit.name,
 abbreviation: unit.abbreviation,
 description: unit.description || ''
 });
 }}
 className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleDeleteUnit(unit.id)}
 className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 )}

 {/* Templates Tab */}
 {activeTab === 'templates' && (
 <div className="space-y-4">
 {/* Form */}
 <div className="bg-surface-raised rounded-lg p-4 border border-border-default">
 <h3 className="font-semibold text-content-primary mb-4">
 {editingTemplate ? 'Editar Template' : 'Novo Template'}
 </h3>
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 Nome *
 </label>
 <input
 type="text"
 value={templateForm.name}
 onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
 className="w-full px-3 py-2 border border-border-default rounded-lg "
 placeholder="Ex: Peso, Tamanho, Volume"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 Descrição
 </label>
 <textarea
 value={templateForm.description}
 onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
 className="w-full px-3 py-2 border border-border-default rounded-lg "
 rows={2}
 placeholder="Descrição opcional do template"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-2">
 Valores *
 </label>
 <div className="space-y-2">
 {templateForm.values.map((value, index) => (
 <div key={index} className="flex gap-2">
 <input
 type="text"
 value={value}
 onChange={(e) => updateTemplateValue(index, e.target.value)}
 className="flex-1 px-3 py-2 border border-border-default rounded-lg "
 placeholder="Ex: 500g, 1kg, 2kg"
 />
 {templateForm.values.length > 1 && (
 <button
 onClick={() => removeTemplateValue(index)}
 className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
 >
 <X className="w-4 h-4" />
 </button>
 )}
 </div>
 ))}
 <button
 onClick={addTemplateValue}
 className="w-full px-4 py-2 border-2 border-dashed border-border-default rounded-lg text-content-secondary hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
 >
 <Plus className="w-4 h-4 inline mr-1" /> Adicionar Valor
 </button>
 </div>
 </div>
 </div>
 <div className="flex justify-end gap-2 mt-4">
 {editingTemplate && (
 <button
 onClick={() => {
 setEditingTemplate(null);
 setTemplateForm({ name: '', description: '', values: [''] });
 }}
 className="px-4 py-2 text-content-secondary hover:bg-surface-base rounded-lg"
 >
 <X className="w-4 h-4 inline mr-1" /> Cancelar
 </button>
 )}
 <button
 onClick={handleSaveTemplate}
 className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center gap-2"
 >
 <Save className="w-4 h-4" /> {editingTemplate ? 'Atualizar' : 'Criar'}
 </button>
 </div>
 </div>

 {/* List */}
 <div className="bg-surface-raised rounded-lg border border-border-default overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-surface-base">
 <tr>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Nome</th>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Valores</th>
 <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary">Status</th>
 <th className="px-4 py-3 text-right text-xs font-semibold text-content-secondary">Ações</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
 {templates.map(template => (
 <tr key={template.id} className="hover:bg-surface-base/50">
 <td className="px-4 py-3">
 <div className="text-sm font-medium text-content-primary">{template.name}</div>
 {template.description && (
 <div className="text-xs text-content-muted">{template.description}</div>
 )}
 </td>
 <td className="px-4 py-3">
 <div className="flex flex-wrap gap-1">
 {template.values.map((value, idx) => (
 <span
 key={idx}
 className="px-2 py-1 bg-surface-base text-content-secondary rounded text-xs"
 >
 {value}
 </span>
 ))}
 </div>
 </td>
 <td className="px-4 py-3">
 <span className={`px-2 py-1 rounded text-xs ${template.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-surface-base text-content-primary '}`}>
 {template.isActive ? 'Ativo' : 'Inativo'}
 </span>
 </td>
 <td className="px-4 py-3 text-right">
 <div className="flex justify-end gap-2">
 <button
 onClick={() => {
 setEditingTemplate(template);
 setTemplateForm({
 name: template.name,
 description: template.description || '',
 values: template.values.length > 0 ? template.values : ['']
 });
 }}
 className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleDeleteTemplate(template.id)}
 className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 )}

 {/* Confirmation Dialog */}
 <ConfirmDialog
 isOpen={confirmDialog.isOpen}
 message={confirmDialog.message}
 onConfirm={confirmDialog.onConfirm}
 onCancel={() => setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } })}
 variant={confirmDialog.variant}
 title="Confirmar Ação"
 confirmText="Confirmar"
 cancelText="Cancelar"
 />
 </div>
 );
};


