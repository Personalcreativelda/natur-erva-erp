import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../core/services/apiClient';
import { getSystemSettings, SystemSettings } from '../../core/services/systemSettingsService';
import { queryKeys } from '../../core/lib/queryClient';
import { Product } from '../../core/types/types';

/**
 * Dados públicos da loja com cache persistente (ver core/lib/queryClient.ts).
 * Todas as páginas (Loja, Produto, Rodapé) partilham a mesma cache → um único pedido.
 */

export interface ShopCategory { id: string; name: string; color: string; imageUrl?: string; isActive: boolean }
export interface ShopBlogPost { id: string; title: string; slug: string; summary?: string; coverImage?: string; tags: string[]; publishedAt?: string; createdAt: string }

const persist = { persist: true } as const;

export const useShopProducts = () =>
  useQuery({
    queryKey: queryKeys.shop.products,
    queryFn: async () => {
      const all = await api.get<Product[]>('/products');
      // Mostrar todos os produtos visíveis na loja, incluindo esgotados (com selo "Esgotado")
      return (all || []).filter(p => p.showInShop !== false);
    },
    meta: persist,
  });

export const useShopCategories = () =>
  useQuery({
    queryKey: queryKeys.shop.categories,
    queryFn: async () => ((await api.get<ShopCategory[]>('/categories')) || []).filter(c => c.isActive !== false),
    staleTime: 60_000, // conteúdo editado no admin: aparece na loja em ~1 min
    meta: persist,
  });

export const useShopBlog = () =>
  useQuery({
    queryKey: queryKeys.shop.blog,
    queryFn: async () => ((await api.get<any[]>('/blog')) || [])
      .filter((p: any) => p.status === 'published')
      .slice(0, 3) as ShopBlogPost[],
    staleTime: 10 * 60_000,
    meta: persist,
  });

export const useShopSettings = () =>
  useQuery({
    queryKey: queryKeys.shop.settings,
    queryFn: (): Promise<SystemSettings> => getSystemSettings(),
    staleTime: 60_000,
    meta: persist,
  });

/** Chaves dos atalhos especiais da loja (imagem definida no admin, em Categorias) */
export const SHOP_TILE_KEYS = { promo: 'tile-promo', new: 'tile-new' } as const;

/** Imagens dos atalhos "Promoções" e "Novidades" (guardadas como banners de página) */
export const useShopTileImages = () =>
  useQuery({
    queryKey: queryKeys.shop.tiles,
    queryFn: async () => {
      const [promo, fresh] = await Promise.all([
        api.get<{ imageUrl?: string } | null>(`/banners/page/${SHOP_TILE_KEYS.promo}`).catch(() => null),
        api.get<{ imageUrl?: string } | null>(`/banners/page/${SHOP_TILE_KEYS.new}`).catch(() => null),
      ]);
      return { promo: promo?.imageUrl || undefined, new: fresh?.imageUrl || undefined };
    },
    staleTime: 30_000, // imagens trocadas no admin aparecem logo
    meta: persist,
  });

/**
 * Imagem de cada categoria: a definida no admin ou, se não houver, a foto do produto
 * mais vendido dessa categoria (foto real, em vez de um ícone genérico).
 */
export const useCategoryImages = (products: Product[]) =>
  useMemo(() => {
    const best = new Map<string, { sold: number; image: string }>();
    for (const p of products) {
      const key = (p.category || '').toLowerCase();
      const image = p.image || p.image2;
      if (!key || !image || image.includes('placeholder')) continue;
      const sold = p.totalSold || 0;
      const current = best.get(key);
      if (!current || sold > current.sold) best.set(key, { sold, image });
    }
    return (categoryName: string, adminImage?: string) =>
      adminImage || best.get(categoryName.toLowerCase())?.image;
  }, [products]);
