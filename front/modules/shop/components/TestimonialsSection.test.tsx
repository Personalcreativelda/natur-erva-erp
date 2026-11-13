import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TestimonialsSection } from './TestimonialsSection';

vi.mock('../../products/services/reviewService', () => ({
  getAllReviews: vi.fn().mockResolvedValue([{
    id: 'review-1',
    product_id: 'product-1',
    product_slug: 'cha-natural',
    product_name: 'Chá Natural',
    user_name: 'Edna',
    rating: 5,
    comment: 'Muito bom',
    avatar_url: null,
    photo_urls: [],
    created_at: '2026-11-13T16:35:20.655Z',
  }]),
  getReviewsSummary: vi.fn().mockResolvedValue({ average: 5, total: 1 }),
}));

describe('TestimonialsSection navigation', () => {
  it('opens the reviewed product when the customer clicks the review', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<TestimonialsSection />} />
          <Route path="/loja/produto/:slug" element={<h1>Página do Chá Natural</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Abrir o produto relacionado com o comentário de Edna' }));

    expect(await screen.findByRole('heading', { name: 'Página do Chá Natural' })).toBeInTheDocument();
  });
});
