import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ChevronDown } from 'lucide-react';
import { FaInstagram, FaFacebookF, FaWhatsapp } from 'react-icons/fa6';
import { Logo } from '../ui/Logo';
import { useShopCategories, useShopSettings } from '../../../shop/hooks/useShopData';

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

const HELP_LINKS = [
 { to: '/rastrear-encomenda', label: 'Rastrear encomenda' },
 { to: '/#faq', label: 'Perguntas frequentes' },
 { to: '/politica', label: 'Política de troca' },
 { to: '/sobre', label: 'Sobre nós' },
 { to: '/contactos', label: 'Fale connosco' },
];

/** Secção que abre/fecha no mobile (o rodapé fica curto; no desktop é coluna aberta) */
const MobileSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
 <details className="group border-b border-white/10">
  <summary className="flex items-center justify-between h-12 cursor-pointer list-none text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
   {title}
   <ChevronDown className="w-4 h-4 text-white/60 transition-transform duration-200 group-open:rotate-180" />
  </summary>
  <ul className="pb-3 text-sm" style={muted}>{children}</ul>
 </details>
);

const FooterComponent: React.FC<FooterProps> = () => {
 // Mesma cache da loja (sem pedidos duplicados ao servidor)
 const categories: Category[] = useShopCategories().data ?? [];
 const settings = useShopSettings().data;
 const companyName = settings?.company_name || '';
 const companyEmail = settings?.company_email || '';
 const whatsapp = (settings?.company_phone || '').replace(/\D/g, '') || DEFAULT_WHATSAPP;

 const social = [
  { href: 'https://www.instagram.com/naturervamz/', label: 'Instagram', icon: FaInstagram, className: 'bg-gradient-to-br from-purple-500 to-pink-500' },
  { href: 'https://www.facebook.com/naturervamz/', label: 'Facebook', icon: FaFacebookF, className: 'bg-blue-600' },
  { href: `https://wa.me/${whatsapp}`, label: 'WhatsApp', icon: FaWhatsapp, className: 'bg-[#25D366]' },
 ];
 const offersHref = `https://wa.me/${whatsapp}?text=${encodeURIComponent('Olá! Quero receber as ofertas da Natur Erva.')}`;
 const categoryLinks = categories.slice(0, 7).map(cat => (
  <li key={cat.id}>
   <Link to={`/?categoria=${encodeURIComponent(cat.name)}`} className={linkClass}>{cat.name}</Link>
  </li>
 ));
 const helpLinks = HELP_LINKS.map(l => (
  <li key={l.to}><Link to={l.to} className={linkClass}>{l.label}</Link></li>
 ));

 const socialIcons = (size: 'sm' | 'md') => (
  <div className="flex gap-2.5">
   {social.map(({ href, label, icon: Icon, className }) => (
    <a
     key={label}
     href={href}
     target="_blank"
     rel="noopener noreferrer"
     aria-label={label}
     className={`${size === 'sm' ? 'w-10 h-10' : 'w-11 h-11'} !min-h-0 rounded-full ${className} flex items-center justify-center hover:scale-105 transition-transform`}
    >
     <Icon className={size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
    </a>
   ))}
  </div>
 );

 return (
  <footer
   className="mt-8 sm:mt-16"
   style={{ background: '#18181b', color: '#ffffff', paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
   {/* ── MOBILE: compacto ── */}
   <div className="md:hidden px-4 pt-6 pb-5">
    <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
     <Logo width={104} height={36} isDarkMode={true} />
     {socialIcons('sm')}
    </div>

    <MobileSection title="Categorias">{categoryLinks}</MobileSection>
    <MobileSection title="Ajuda">{helpLinks}</MobileSection>

    <a
     href={offersHref}
     target="_blank"
     rel="noopener noreferrer"
     className="mt-5 flex w-full items-center justify-center gap-2 h-11 rounded-xl bg-green-600 active:bg-green-700 text-white text-sm font-semibold"
    >
     <FaWhatsapp className="h-[18px] w-[18px]" />
     Receber ofertas no WhatsApp
    </a>
    {companyEmail && (
     <a href={`mailto:${companyEmail}`} className="mt-3 flex items-center justify-center gap-2 min-h-[40px] text-sm break-all" style={muted}>
      <Mail className="h-4 w-4 text-green-500 flex-shrink-0" />
      {companyEmail}
     </a>
    )}

    <p className="mt-3 text-center text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
     © {new Date().getFullYear()} {companyName} · Todos os direitos reservados
    </p>
   </div>

   {/* ── DESKTOP/TABLET: colunas ── */}
   <div className="hidden md:block max-w-7xl mx-auto px-6 pt-10 pb-6">
    <div className="grid grid-cols-4 gap-10">
     {/* Marca */}
     <div>
      <Logo width={130} height={44} isDarkMode={true} />
      <p className="mt-3 text-sm leading-relaxed max-w-xs" style={muted}>
       Produtos naturais de qualidade para a sua saúde e bem-estar, seleccionados com cuidado.
      </p>
      <div className="mt-4">{socialIcons('md')}</div>
     </div>

     <nav aria-label="Categorias">
      <h4 className="mb-2 font-semibold text-white text-sm">Categorias</h4>
      <ul className="text-sm" style={muted}>{categoryLinks}</ul>
     </nav>

     <nav aria-label="Ajuda">
      <h4 className="mb-2 font-semibold text-white text-sm">Ajuda</h4>
      <ul className="text-sm" style={muted}>{helpLinks}</ul>
     </nav>

     {/* Contacto — antes era um campo de newsletter que não enviava nada */}
     <div>
      <h4 className="mb-2 font-semibold text-white text-sm">Ofertas e novidades</h4>
      <p className="text-sm mb-4" style={muted}>Receba promoções exclusivas directamente no WhatsApp.</p>
      <a
       href={offersHref}
       target="_blank"
       rel="noopener noreferrer"
       className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
      >
       <FaWhatsapp className="h-[18px] w-[18px]" />
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
