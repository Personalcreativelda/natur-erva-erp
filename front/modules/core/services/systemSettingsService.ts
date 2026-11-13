import { appSystemConfig } from '../../../config/appConfig';
import api from './apiClient';

/** Método de pagamento móvel do checkout (backend: tax_config.payment_methods). */
export interface PaymentMethodConfig {
  id: 'mpesa' | 'emola';
  label: string;
  enabled: boolean;
  merchantCode: string;
  merchantName: string;
  ussd: string;
  logoUrl: string;
}

export interface SystemSettings {
  system_name?: string;
  logo_light?: string;
  logo_dark?: string;
  logo_icon?: string;
  favicon?: string;
  primary_color?: string;
  secondary_color?: string;
  theme_font?: string;
  theme_radius?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_address?: string;
  company_website?: string;
  mpesa_merchant_code?: string;
  mpesa_merchant_name?: string;
  payment_methods?: PaymentMethodConfig[];
  [key: string]: unknown;
}

const CACHE_KEY = 'sys_logo_settings';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const invalidateLogoCache = (): void => {
  localStorage.removeItem(CACHE_KEY);
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }

    const config = await api.get<any>('/tax/config');
    const base = appSystemConfig as SystemSettings;
    const settings: SystemSettings = {
      ...base,
      ...(config.logoUrl ? { logo_light: config.logoUrl, logo_dark: config.logoUrl } : {}),
      ...(config.logoIconUrl ? { logo_icon: config.logoIconUrl, favicon: config.logoIconUrl } : {}),
      ...(config.themePrimaryColor ? { primary_color: config.themePrimaryColor } : {}),
      ...(config.themeFont ? { theme_font: config.themeFont } : {}),
      ...(config.themeRadius ? { theme_radius: config.themeRadius } : {}),
      // Identidade da empresa vinda da BD (tax_config) — permite reconfigurar
      // o sistema para outra empresa sem tocar no código.
      ...(config.companyName ? { company_name: config.companyName } : {}),
      ...(config.companyEmail ? { company_email: config.companyEmail } : {}),
      ...(config.companyPhone ? { company_phone: config.companyPhone } : {}),
      ...(config.companyAddress ? { company_address: config.companyAddress } : {}),
      // Pagamento M-Pesa ao comerciante (vazio = checkout sem pagamento M-Pesa)
      mpesa_merchant_code: config.mpesaMerchantCode || '',
      mpesa_merchant_name: config.mpesaMerchantName || '',
      // Métodos de pagamento móvel (M-Pesa, e-Mola) configurados em Finanças
      payment_methods: Array.isArray(config.paymentMethods) ? config.paymentMethods : [],
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: settings }));
    return settings;
  } catch {
    return appSystemConfig as SystemSettings;
  }
};

export const saveSystemSettings = async (_settings: SystemSettings): Promise<boolean> => {
  return true;
};

export const updateFavicon = (faviconUrl: string): void => {
  if (!faviconUrl) return;

  const applyFaviconLinks = (href: string): void => {
    document.querySelectorAll("link[rel*='icon']").forEach(el => {
      const h = el.getAttribute('href') || '';
      if (!h.startsWith('data:')) el.remove();
    });

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.setAttribute('sizes', '64x64');
    link.href = href;
    const firstLink = document.head.querySelector('link');
    firstLink ? document.head.insertBefore(link, firstLink) : document.head.appendChild(link);

    const shortcut = document.createElement('link');
    shortcut.rel = 'shortcut icon';
    shortcut.type = 'image/png';
    shortcut.href = href;
    document.head.appendChild(shortcut);

    const appleIcon = document.querySelector("link[rel='apple-touch-icon']");
    if (appleIcon) {
      appleIcon.setAttribute('href', href);
    } else {
      const appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.setAttribute('sizes', '180x180');
      appleLink.href = href;
      document.head.appendChild(appleLink);
    }
  };

  // Renderiza num canvas 64x64 em modo "cover" para preencher toda a área do tab
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const SIZE = 64;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(SIZE / img.width, SIZE / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      applyFaviconLinks(canvas.toDataURL('image/png'));
    } catch {
      // CORS bloqueou toDataURL — usar URL directamente
      applyFaviconLinks(faviconUrl);
    }
  };
  img.onerror = () => applyFaviconLinks(faviconUrl);
  img.src = faviconUrl;
};

export const updatePageTitle = (title: string): void => {
  document.title = title;
};
