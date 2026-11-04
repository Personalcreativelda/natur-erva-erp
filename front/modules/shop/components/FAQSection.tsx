import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const ALL_FAQS: FAQItem[] = [
  {
    question: '1. Como posso rastrear meu pedido?',
    answer:
      'Após a confirmação do pagamento, você receberá um código de rastreamento por e-mail ou WhatsApp. Acesse o site da transportadora informada e insira o código para acompanhar o status da entrega em tempo real.',
  },
  {
    question: '2. Por que não recebi a confirmação do pedido por e-mail?',
    answer:
      'Verifique a pasta de spam ou lixo eletrônico do seu e-mail. Caso não encontre, entre em contato conosco pelo WhatsApp para que possamos reenviar a confirmação.',
  },
  {
    question: '3. Meu pedido veio incompleto. O que devo fazer?',
    answer:
      'Lamentamos o transtorno! Entre em contato com nosso suporte pelo WhatsApp ou e-mail em até 48 horas após o recebimento, informando o número do pedido e os itens faltantes.',
  },
  {
    question: '4. Como funcionam os cupons de desconto e promoções?',
    answer:
      'Os cupons de desconto podem ser aplicados no momento do checkout. Cada cupom tem validade e condições específicas descritas na promoção. Não é possível combinar mais de um cupom por pedido.',
  },
  {
    question: '5. Quais são os canais de atendimento ao cliente?',
    answer:
      'Você pode nos contatar pelo WhatsApp, e-mail ou pelas nossas redes sociais (Instagram e Facebook). Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.',
  },
  {
    question: '6. Qual é o prazo de entrega?',
    answer:
      'O prazo de entrega varia conforme a sua região e a modalidade de frete escolhida. Após a confirmação do pagamento, o pedido é processado em até 1 dia útil e o prazo de entrega começa a contar a partir daí.',
  },
  {
    question: '7. Posso trocar ou devolver um produto?',
    answer:
      'Sim! Aceitamos trocas e devoluções em até 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor, desde que o produto esteja lacrado e em sua embalagem original.',
  },
  {
    question: '8. Os produtos são originais e têm garantia de qualidade?',
    answer:
      'Sim, todos os nossos produtos são 100% originais, adquiridos diretamente dos fabricantes e distribuidoras autorizadas. Trabalhamos apenas com marcas de confiança para garantir a sua saúde e segurança.',
  },
  {
    question: '9. Como posso pagar meu pedido?',
    answer:
      'Aceitamos diversas formas de pagamento: Pix, cartão de crédito (em até 12x), cartão de débito e transferência bancária. Todas as transações são seguras e criptografadas.',
  },
  {
    question: '10. Vocês entregam em todo o Brasil?',
    answer:
      'Sim! Realizamos entregas para todo o território nacional. O frete é calculado automaticamente ao informar o seu CEP na página de checkout.',
  },
];

const PAGE_SIZE = 5;

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(ALL_FAQS.length / PAGE_SIZE);
  const pageFaqs = ALL_FAQS.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const handleToggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    setOpenIndex(null);
  };

  return (
    <section id="faq" className="max-w-3xl mx-auto px-4 py-10 sm:py-14 scroll-mt-20">
      <h2 className="text-xl sm:text-2xl font-bold text-content-primary mb-6">
        Perguntas frequentes
      </h2>

      <div className="space-y-3">
        {pageFaqs.map((faq, idx) => {
          const globalIdx = page * PAGE_SIZE + idx;
          const isOpen = openIndex === globalIdx;
          return (
            <div
              key={globalIdx}
              className="bg-surface-raised border border-border-default rounded-xl shadow-sm overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left"
                onClick={() => handleToggle(globalIdx)}
                aria-expanded={isOpen}
              >
                <span className="font-medium text-content-primary text-sm sm:text-base">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`h-5 w-5 text-content-muted flex-shrink-0 transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-4 sm:px-6 pb-5">
                  <p className="text-content-secondary text-sm leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination dots */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 mt-6">
          {Array.from({ length: totalPages }).map((_, p) => (
            <button
              key={p}
              onClick={() => handlePageChange(p)}
              className={`w-2.5 h-2.5 m-2 rounded-full transition-colors ${
                p === page
                  ? 'bg-green-600 dark:bg-green-400'
                  : 'bg-border-strong dark:bg-white/[0.2] hover:bg-content-muted'
              }`}
              aria-label={`Página ${p + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
