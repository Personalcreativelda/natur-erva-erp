import React, { useState, useEffect } from 'react';
import { getSystemSettings } from '../../../core/services/systemSettingsService';

interface LogoProps {
 className?: string;
 width?: number | string;
 height?: number | string;
 variant?: 'full' | 'icon'; // full = logo completo, icon = logo é­cone para sidebar fechado
 isDarkMode?: boolean; // Para determinar qual logo usar (light ou dark)
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Placeholder genérico (sem marca fixa no código) enquanto a empresa não configurar o seu próprio logótipo. */
const buildPlaceholderLogo = (companyName: string, variant: 'full' | 'icon') => {
 const name = escapeXml((companyName || 'Logo').trim());
 if (variant === 'icon') {
 const initials = escapeXml((companyName || 'L').trim().slice(0, 2).toUpperCase());
 return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#059669"/><text x="32" y="41" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`)}`;
 }
 return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><text x="0" y="40" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#059669">${name}</text></svg>`)}`;
};

export const Logo: React.FC<LogoProps> = ({
 className = '',
 width = 'auto',
 height = 'auto',
 variant = 'full',
 isDarkMode = false
}) => {
 const [companyName, setCompanyName] = useState<string>('Logo');
 // Inicializa com um placeholder genérico até o logótipo próprio da empresa (Finanças) carregar
 const [logoUrl, setLogoUrl] = useState<string>(() => buildPlaceholderLogo('Logo', variant));

 useEffect(() => {
 const loadLogo = async () => {
 try {
 const settings = await getSystemSettings();
 const name = settings.company_name || 'Logo';
 if (settings.company_name) setCompanyName(settings.company_name);

 let customLogo: string | undefined;
 if (variant === 'icon') {
 customLogo = settings.logo_icon;
 } else {
 customLogo = (isDarkMode ? settings.logo_dark : settings.logo_light) || settings.logo_light || settings.logo_dark;
 }
 setLogoUrl(customLogo || buildPlaceholderLogo(name, variant));
 } catch {
 // silently keep the generic placeholder
 }
 };

 loadLogo();
 window.addEventListener('logo:updated', loadLogo);
 return () => window.removeEventListener('logo:updated', loadLogo);
 }, [variant, isDarkMode]);

 return (
 <img
 src={logoUrl}
 alt={variant === 'icon' ? `${companyName} Icon` : `${companyName} Logo`}
 className={`${className} object-contain`}
 width={width}
 height={height}
 style={{ 
 maxWidth: '100%', 
 width: width === 'auto' ? 'auto' : `${width}px`,
 height: height === 'auto' ? 'auto' : `${height}px`,
 display: 'block',
 objectFit: 'contain'
 }}
 loading="lazy"
 onError={(e) => {
 // Se o logótipo configurado falhar a carregar (URL quebrada, etc.), cair para o placeholder genérico
 const target = e.target as HTMLImageElement;
 const placeholder = buildPlaceholderLogo(companyName, variant);
 if (target.src !== placeholder) target.src = placeholder;
 }}
 />
 );
};


