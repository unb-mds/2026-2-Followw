import type { InternshipDetail, InternshipItem } from '@followw/core/queries/internships.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';

import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test } from 'bun:test';

import { formatCurrency, formatDate, InternshipCard } from '#/components/search/InternshipCard';
import { InternshipDetailView } from '#/components/search/InternshipDetailDialog';
import { InternshipSection } from '#/components/search/InternshipSection';
import { SearchResults } from '#/components/search/SearchResults';
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

test('filtra o mural por todos os termos sem acentos e mantém a ordem', () => {
    const items = [ITEM_CURSO, ITEM_GERAL];
    expect(filterInternships(items, '  JUNIOR python ')).toEqual([ITEM_CURSO]);
    expect(filterInternships(items, 'administracao publica')).toEqual([ITEM_GERAL]);
    expect(filterInternships(items, 'python publica')).toEqual([]);
    expect(filterInternships(items, null)).toBe(items);
});

test('exibe estágios na aba Todos enquanto a busca pública está pendente', () => {
    const user: UserProfile = {
        name: 'Fulano',
        registration: '123',
        photo: null,
        bio: null,
        unit: null,
        course: null,
        entry_semester: null,
        integralization: null,
        workload: null,
        period_max_workload: null,
        ira: null,
        mp: null,
        level: 'Graduação'
    };
    client.setQueryData(meQueryOptions.queryKey, user);
    client.setQueryData(internshipsQueryOptions.queryKey, [ITEM_CURSO]);
    const { getByText } = dom.testing.render(
        <QueryClientProvider client={client}>
            <SearchResults
                text="python"
                types={undefined}
                empty="Nenhum resultado"
                currentPeriod={null}
                taken={null}
                onShowCategory={() => {}}
            />
        </QueryClientProvider>
    );

    expect(getByText('Desenvolvedor Python Júnior')).toBeTruthy();
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

test('exibe o concedente, a descrição e um curso elegível por item da lista', () => {
    const { getByText, getAllByRole } = dom.testing.render(
        <Dialog open>
            <InternshipDetailView
                detail={{
                    ...DETAIL,
                    courses: [
                        ...DETAIL.courses,
                        { name: 'MATEMÁTICA', unit: 'MAT', degree: 'Bacharelado' },
                        { name: 'MATEMÁTICA', unit: 'MAT', degree: 'Licenciatura' }
                    ]
                }}
            />
        </Dialog>
    );

    expect(getByText('Desenvolvedor Python Júnior')).toBeTruthy();
    expect(getByText('Empresa Tech Df')).toBeTruthy();
    expect(getByText('CNPJ: 00.000.000/0001-91')).toBeTruthy();
    expect(getByText('Inscrição via SIGAA')).toBeTruthy();
    expect(getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Engenharia de Software',
        'Matemática',
        'Matemática · Licenciatura'
    ]);
    expect(getByText('edital_estagio.pdf')).toBeTruthy();
    expect(getByText(/Atuação com Python e/)).toBeTruthy();
});
