import React from 'react';

export interface PageShellProps {
 title: string;
 description?: string;
 /** Alias de `description` (usado por várias páginas) */
 subtitle?: string;
 /** Ícone opcional mostrado ao lado do título */
 icon?: React.ReactNode;
 actions?: React.ReactNode;
 children: React.ReactNode;
 /**
 * Se true, aplica padding interno. Por padrão fica false porque o `Layout`
 * já aplica padding responsivo no `<main>`.
 */
 withInnerPadding?: boolean;
 className?: string;
 compactHeaderMobile?: boolean;
}

export const PageShell: React.FC<PageShellProps> = ({
 title,
 description: descriptionProp,
 subtitle,
 icon,
 actions,
 children,
 withInnerPadding = false,
 className = '',
 compactHeaderMobile = false,
}) => {
 const description = descriptionProp ?? subtitle;

 // Cabeçalho único para todas as páginas admin (o compactHeaderMobile mantém-se por compatibilidade)
 void compactHeaderMobile;
 const titleClass = 'text-xl sm:text-2xl lg:text-[26px] leading-tight font-bold tracking-tight text-content-primary truncate';
 const descriptionClass = 'text-sm text-content-muted mt-1 line-clamp-2';
 const headerClass = 'flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-6';

 return (
 <div className={[withInnerPadding ? 'p-4 md:p-6' : '', 'space-y-4 sm:space-y-6', className].join(' ')}>
 {(title || actions) && (
 <div className={headerClass}>
 {title && (
 <div className="min-w-0 flex items-center gap-3">
 {icon && (
 <span className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-brand-600/10 text-brand-600 dark:text-brand-400 [&>svg]:w-5 [&>svg]:h-5">
 {icon}
 </span>
 )}
 <div className="min-w-0">
 <h1 className={titleClass}>{title}</h1>
 {description && <p className={descriptionClass}>{description}</p>}
 </div>
 </div>
 )}
 {/* No mobile as acções ocupam a largura toda (alvos maiores, zona do polegar) */}
 {/* Regras de mobile em .page-actions (index.html): os botões dividem a largura
     em partes iguais e, sem texto visível, ficam só com o ícone centrado */}
 {actions && <div className="page-actions flex gap-2 flex-wrap md:flex-nowrap md:shrink-0">{actions}</div>}
 </div>
 )}
 {children}
 </div>
 );
};



