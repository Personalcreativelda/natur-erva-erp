import React, { useState, useEffect } from 'react';
import { LabelPrintModal } from '../components/modals/LabelPrintModal';
import { productService } from '../services/productService';
import { Product } from '../../core/types/product';
import { Loader2 } from 'lucide-react';
import { PageShell } from '../../core/components/layout/PageShell';

export const EtiquetasPage: React.FC = () => {
 const [products, setProducts] = useState<Product[]>([]);
 const [loading, setLoading] = useState(true);

 const load = () => {
 setLoading(true);
 productService.getProducts().then(data => {
 setProducts(data);
 setLoading(false);
 }).catch(() => setLoading(false));
 };

 useEffect(() => { load(); }, []);

 return (
 <PageShell title="Etiquetas" description="Impressão de etiquetas e códigos de barra dos produtos">
 {loading ? (
 <div className="flex items-center justify-center h-96">
 <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
 </div>
 ) : (
 <LabelPrintModal
 products={products}
 open={true}
 onClose={() => {}}
 onBarcodeAssigned={load}
 embedded
 />
 )}
 </PageShell>
 );
};
