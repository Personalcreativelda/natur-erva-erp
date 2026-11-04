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
 * Se true, aplica padding interno. Por padréo fica false porque o `Layout`
 * jé¡ aplica padding responsivo no `<main>`.
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

 const titleClass = compactHeaderMobile
 ? 'text-xl md:text-3xl font-bold tracking-tight text-content-primary'
 : 'text-2xl md:text-3xl font-bold tracking-tight text-content-primary';

 const descriptionClass = compactHeaderMobile
 ? 'text-xs md:text-sm text-content-muted mt-1'
 : 'text-sm text-content-muted mt-1';

 const headerClass = compactHeaderMobile
 ? 'flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4'
 : 'flex flex-col md:flex-row md:items-center md:justify-between gap-4';

 return (
 <div className={[withInnerPadding ? 'p-4 md:p-6' : '', 'space-y-6', className].join(' ')}>
 {(title || actions) && (
 <div className={headerClass}>
 {title && (
 <div className="min-w-0 flex items-start gap-3">
 {icon && (
 <span className="shrink-0 mt-0.5 w-10 h-10 rounded-2xl flex items-center justify-center bg-brand-600/10 text-brand-600 dark:text-brand-400">
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
 {actions && <div className="flex gap-2 flex-wrap [&>*]:flex-1 md:[&>*]:flex-none">{actions}</div>}
 </div>
 )}
 {children}
 </div>
 );
};



