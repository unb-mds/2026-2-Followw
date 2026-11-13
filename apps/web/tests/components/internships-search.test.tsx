import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test } from 'bun:test';

import type { InternshipDetail, InternshipItem } from '@followw/core/queries/internships.ts';

import { formatCurrency, formatDate, InternshipCard } from '#/components/search/InternshipCard';
import { InternshipDetailView } from '#/components/search/InternshipDetailDialog';
import { InternshipSection } from '#/components/search/InternshipSection';
import { Dialog } from '#/components/ui/dialog';

import { useDom } from '../helpers/dom';

const dom = useDom();

const ITEM_CURSO: InternshipItem = {
    reference: 'listagem_meu_curso:0:hash123',
    title: 'Desenvolvedor Python Júnior',
    vacancies: 2,
    stipend: '1500.00',
    published_until: '2026-12-01T18:00:00Z',
    is_my_course: true
};

const ITEM_GERAL: InternshipItem = {
    reference: 'listagem_outros_cursos:0:hash456',
    title: 'Estágio em Administração Pública',
    vacancies: 1,
    stipend: null,
    published_until: '2026-11-20T23:59:00Z',
    is_my_course: false
};

const DETAIL: InternshipDetail = {
    reference: 'listagem_meu_curso:0:hash123',
    title: 'Desenvolvedor Python Júnior',
    vacancies: 2,
    stipend: '1500.00',
    transport_allowance: {
        amount: '10.00',
        period: 'dia'
    },
    published_from: '2026-11-01T08:00:00Z',
    published_until: '2026-12-01T18:00:00Z',
    sigaa_enrollment: true,
    attachment: {
        name: 'edital_estagio.pdf',
        url: 'https://sigaa.unb.br/edital.pdf'
    },
    grantor: {
        agreement_type: 'Convênio Direto',
        cnpj: '00.000.000/0001-91',
        name: 'Empresa Tech DF',
        responsibles: ['João Silva']
    },
    courses: [
        {
            name: 'ENGENHARIA DE SOFTWARE',
            unit: 'FCTE',
            degree: 'Bacharelado'
        }
    ],
    description: 'Atuação com Python e **FastAPI**.',
    is_my_course: true
};

let client: QueryClient;

beforeEach(() => {
    client = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    });
});

test('formatCurrency formata valores monetários corretamente', () => {
    expect(formatCurrency('1500.00')).toContain('1.500,00');
    expect(formatCurrency(null)).toBeNull();
    expect(formatCurrency(0)).toBeNull();
    expect(formatCurrency('invalid')).toBeNull();
});

test('formatDate formata data em formato pt-BR', () => {
    const formatted = formatDate('2026-12-01T18:00:00Z');
    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
});

test('InternshipCard exibe título, badge Seu Curso e dispara clique', () => {
    let clicked = false;

    const { getByText } = dom.testing.render(
        <InternshipCard internship={ITEM_CURSO} onClick={() => (clicked = true)} />
    );

    expect(getByText('Desenvolvedor Python Júnior')).toBeTruthy();
    expect(getByText('Seu Curso')).toBeTruthy();
    expect(getByText('2 vagas')).toBeTruthy();

    dom.testing.fireEvent.click(getByText('Desenvolvedor Python Júnior'));
    expect(clicked).toBe(true);
});

test('InternshipCard exibe badge Geral e bolsa a combinar quando nula', () => {
    const { getByText } = dom.testing.render(
        <InternshipCard internship={ITEM_GERAL} onClick={() => {}} />
    );

    expect(getByText('Estágio em Administração Pública')).toBeTruthy();
    expect(getByText('Geral')).toBeTruthy();
    expect(getByText('Bolsa a combinar')).toBeTruthy();
    expect(getByText('1 vaga')).toBeTruthy();
});

test('InternshipSection renderiza itens e botão Ver todas com previewLimit', () => {
    let showAllCalled = false;

    const { getByText, queryByText } = dom.testing.render(
        <QueryClientProvider client={client}>
            <InternshipSection
                internships={[ITEM_CURSO, ITEM_GERAL]}
                previewLimit={1}
                onShowAll={() => (showAllCalled = true)}
            />
        </QueryClientProvider>
    );

    expect(getByText('Desenvolvedor Python Júnior')).toBeTruthy();
    expect(queryByText('Estágio em Administração Pública')).toBeNull();
    expect(getByText('Ver todas')).toBeTruthy();

    dom.testing.fireEvent.click(getByText('Ver todas'));
    expect(showAllCalled).toBe(true);
});

test('InternshipDetailView exibe concedente, cursos e descrição formatada', () => {
    const { getByText } = dom.testing.render(
        <Dialog open>
            <InternshipDetailView detail={DETAIL} />
        </Dialog>
    );

    expect(getByText('Desenvolvedor Python Júnior')).toBeTruthy();
    expect(getByText('Empresa Tech Df')).toBeTruthy();
    expect(getByText('CNPJ: 00.000.000/0001-91')).toBeTruthy();
    expect(getByText('Inscrição via SIGAA')).toBeTruthy();
    expect(getByText('edital_estagio.pdf')).toBeTruthy();
    expect(getByText(/Atuação com Python e/)).toBeTruthy();
});
