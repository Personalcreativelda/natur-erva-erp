import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ProductCard } from './ProductCard';

vi.mock('../../services/reviewService', () => ({
  getProductRating: vi.fn().mockResolvedValue({ average: 0, total: 0 }),
  getProductReviews: vi.fn().mockResolvedValue([]),
  submitReview: vi.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
});

describe('ProductCard reviews', () => {
  it('opens the review form for an authenticated customer when there are no reviews yet', async () => {
    render(
      <MemoryRouter>
        <ProductCard
          product={{
            id: 'product-1',
            name: 'Produto natural',
            slug: 'produto-natural',
            category: 'Suplementos',
            price: 500,
            stock: 10,
          } as any}
          onAddToCart={vi.fn()}
          currentUserName="Cliente"
          canReview
        />
      </MemoryRouter>,
    );

    const reviewButton = await screen.findByRole('button', { name: 'Avaliar' });
    fireEvent.click(reviewButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Avaliações' })).toBeInTheDocument();
      expect(screen.getByText('Deixar avaliação')).toBeInTheDocument();
    });
  });
});
