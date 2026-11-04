import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Phone, Mail, MessageCircle } from 'lucide-react';
import { Logo } from '../ui/Logo';
import api from '../../../core/services/apiClient';
import { getSystemSettings } from '../../services/systemSettingsService';

interface Category {
 id: string;
 name: string;
 isActive: boolean;
}

interface FooterProps {
 isShopMode?: boolean;
}

const DEFAULT_WHATSAPP = '258874209440';
const muted = { color: 'rgba(255,255,255,0.6)' };
const linkClass = 'flex items-center min-h-[40px] py-1.5 leading-snug hover:text-green-400 transition-colors';

const FooterComponent: React.FC<FooterProps> = () => {
 const [categories, setCategories] = useState<Category[]>([]);
 const [companyName, setCompanyName] = useState('');
 const [companyEmail, setCompanyEmail] = useState('');
 const [whatsapp, setWhatsapp] = useState(DEFAULT_WHATSAPP);

 useEffect(() => {
 api.get('/categories')
 .then((data: any) => setCategories((data || []).filter((c: Category) => c.isActive !== false)))
 .catch(() => {});
 getSystemSettings().then(settings => {
 if (settings.company_name) setCompanyName(settings.company_name);
 if (settings.company_email) setCompanyEmail(settings.company_email);
 const phone = (settings.company_phone || '').replace(/\D/g, '');
 if (phone) setWhatsapp(phone);
 }).catch(() => {});
 }, []);

 const social = [
 { href: 'https://www.instagram.com/naturervamz/', label: 'Instagram', icon: Instagram, className: 'bg-gradient-to-br from-purple-500 to-pink-500' },
 { href: 'https://www.facebook.com/naturervamz/', label: 'Facebook', icon: Facebook, className: 'bg-blue-600' },
 { href: `https://wa.me/${whatsapp}`, label: 'WhatsApp', icon: Phone, className: 'bg-green-600' },
 ];

 return (
 <footer
 className="mt-8 sm:mt-16"
 style={{ background: '#18181b', color: '#ffffff', paddingBottom: 'env(safe-area-inset-bottom)' }}
 >
 <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-6">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 md:gap-10">

 {/* Marca */}
 <div className="col-span-2 md:col-span-1">
 <Logo width={130} height={44} isDarkMode={true} />
 <p className="mt-3 text-sm leading-relaxed max-w-xs" style={muted}>
 Produtos naturais de qualidade para a sua saúde e bem-estar, seleccionados com cuidado.
 </p>
 <div className="flex gap-3 mt-4">
 {social.map(({ href, label, icon: Icon, className }) => (
 <a
 key={label}
 href={href}
 target="_blank"
 rel="noopener noreferrer"
 aria-label={label}
 className={`w-11 h-11 rounded-full ${className} flex items-center justify-center hover:scale-105 transition-transform`}
 >
 <Icon className="h-5 w-5" />
 </a>
 ))}
 </div>
 </div>

 {/* Categorias */}
 <nav aria-label="Categorias">
 <h4 className="mb-2 font-semibold text-white text-sm">Categorias</h4>
 <ul className="text-sm" style={muted}>
 {categories.slice(0, 7).map(cat => (
 <li key={cat.id}>
 <Link to={`/?categoria=${encodeURIComponent(cat.name)}`} className={linkClass}>{cat.name}</Link>
 </li>
 ))}
 </ul>
 </nav>

 {/* Ajuda */}
 <nav aria-label="Ajuda">
 <h4 className="mb-2 font-semibold text-white text-sm">Ajuda</h4>
 <ul className="text-sm" style={muted}>
 <li><Link to="/rastrear-encomenda" className={linkClass}>Rastrear encomenda</Link></li>
 <li><Link to="/#faq" className={linkClass}>Perguntas frequentes</Link></li>
 <li><Link to="/politica" className={linkClass}>Política de troca</Link></li>
 <li><Link to="/sobre" className={linkClass}>Sobre nós</Link></li>
 <li><Link to="/contactos" className={linkClass}>Fale connosco</Link></li>
 </ul>
 </nav>

 {/* Contacto — antes era um campo de newsletter que não enviava nada */}
 <div className="col-span-2 md:col-span-1">
 <h4 className="mb-2 font-semibold text-white text-sm">Ofertas e novidades</h4>
 <p className="text-sm mb-4" style={muted}>Receba promoções exclusivas directamente no WhatsApp.</p>
 <a
 href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Olá! Quero receber as ofertas da Natur Erva.')}`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-11 px-5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
 >
 <MessageCircle className="h-4 w-4" />
 Receber ofertas no WhatsApp
 </a>
 {companyEmail && (
 <a href={`mailto:${companyEmail}`} className="mt-4 flex items-center gap-2 text-sm hover:text-green-400 transition-colors break-all" style={muted}>
 <Mail className="h-4 w-4 text-green-500 flex-shrink-0" />
 {companyEmail}
 </a>
 )}
 </div>
 </div>

 <div className="mt-8 pt-5 text-center text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
 © {new Date().getFullYear()} {companyName} · Todos os direitos reservados
 </div>
 </div>
 </footer>
 );
};

export const Footer = memo(FooterComponent, (prev, next) => prev.isShopMode === next.isShopMode);
