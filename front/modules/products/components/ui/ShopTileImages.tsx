import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, Percent, Sparkles } from 'lucide-react';
import api from '../../../core/services/apiClient';
import { uploadService } from '../../../../services/uploadService';
import { queryKeys } from '../../../core/lib/queryClient';
import { useShopTileImages, SHOP_TILE_KEYS } from '../../../shop/hooks/useShopData';

type TileKind = 'promo' | 'new';

const TILES: Record<TileKind, { label: string; hint: string; color: string; icon: React.ElementType }> = {
  promo: { label: 'Promoções', hint: 'Mostra os produtos com promoção activa', color: '#dc2626', icon: Percent },
  new: { label: 'Novidades', hint: 'Mostra os 12 produtos mais recentes', color: '#2563eb', icon: Sparkles },
};

/**
 * Imagens dos atalhos especiais da loja (aparecem junto das categorias, na página inicial).
 * Sem imagem, a loja usa a foto de um produto da própria lista.
 */
export const ShopTileImages: React.FC<{ showToast: (message: string, type?: any) => void }> = ({ showToast }) => {
  const queryClient = useQueryClient();
  const { data } = useShopTileImages();
  const [busy, setBusy] = useState<TileKind | null>(null);

  const save = async (kind: TileKind, imageUrl: string | null) => {
    await api.put(`/banners/page/${SHOP_TILE_KEYS[kind]}`, {
      imageUrl,
      title: TILES[kind].label,
      subtitle: '',
      bgColor: TILES[kind].color,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.shop.tiles });
  };

  const onUpload = async (kind: TileKind, file: File) => {
    setBusy(kind);
    try {
      const result = await uploadService.uploadImage(file, 'banners', 600);
      if (!result?.url) throw new Error('upload');
      await save(kind, result.url);
      showToast(`Imagem de "${TILES[kind].label}" actualizada`, 'success');
    } catch {
      showToast('Não foi possível guardar a imagem. Tente novamente.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async (kind: TileKind) => {
    setBusy(kind);
    try {
      await save(kind, null);
      showToast(`"${TILES[kind].label}" volta a usar a foto de um produto`, 'success');
    } catch {
      showToast('Não foi possível remover a imagem.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border-default bg-surface-raised p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-content-primary">Atalhos da loja</h3>
        <p className="text-xs text-content-muted mt-0.5">Aparecem junto das categorias na página inicial. Sem imagem, a loja usa a foto de um produto.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(TILES) as TileKind[]).map(kind => {
          const tile = TILES[kind];
          const Icon = tile.icon;
          const img = data?.[kind];
          return (
            <div key={kind} className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-base p-3">
              <span
                className="relative shrink-0 w-14 h-14 rounded-full overflow-hidden border border-border-default flex items-center justify-center"
                style={img ? undefined : { backgroundColor: tile.color }}
              >
                {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Icon className="w-6 h-6 text-white" />}
                {busy === kind && (
                  <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-content-primary">{tile.label}</p>
                <p className="text-xs text-content-muted truncate">{tile.hint}</p>
                <div className="flex gap-2 mt-2">
                  <label className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-default bg-surface-raised text-xs font-medium text-content-secondary hover:bg-surface-overlay cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                    <Upload className="w-3.5 h-3.5" />
                    {img ? 'Trocar' : 'Carregar imagem'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) onUpload(kind, file);
                      }}
                    />
                  </label>
                  {img && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => onRemove(kind)}
                      className="h-8 !min-h-0 px-3 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
