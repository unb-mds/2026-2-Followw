import type { ProfessorItem, ProfessorPage } from '@followw/core/queries/professors.ts';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { ProfessorCard } from '#/components/search/ProfessorCard';
import { ProfessorSection } from '#/components/search/ProfessorSection';

import { renderWithRouter } from '../../helpers/router';

const professor: ProfessorItem = {
    siape: 1234567,
    name: 'EDSON ALVES DA SILVA',
    unit: {
        id: 673,
        code: 'FCTE',
        name: 'CAMPUS UNB GAMA: FACULDADE DE ENGENHARIA - BRASÍLIA'
    },
    photo: 'https://sigaa.unb.br/foto-edson.jpg',
    url: 'https://sigaa.unb.br/perfil?siape=1234567'
};

describe('ProfessorCard', () => {
    test('renderiza nome em titleCase, unidade formatada e link para perfil', () => {
        const html = renderWithRouter(<ProfessorCard professor={professor} />);

        expect(html).toContain('Edson Alves da Silva');
        expect(html).toContain('FCTE · Campus UnB Gama');
        expect(html).toContain('href="/professores/1234567"');
        expect(html).toContain('src="https://sigaa.unb.br/foto-edson.jpg"');
    });

    test('renderiza avatar padrão quando não há foto', () => {
        const html = renderWithRouter(<ProfessorCard professor={{ ...professor, photo: null }} />);

        expect(html).toContain('Edson Alves da Silva');
        expect(html).not.toContain('<img');
    });
});

const page = (items: ProfessorItem[], total = items.length): ProfessorPage => ({
    items,
    total,
    page: 1,
    page_size: 25
});

const renderSection = (first: ProfessorPage, onShowAll?: () => void) =>
    renderWithRouter(
        <QueryClientProvider client={new QueryClient()}>
            <ProfessorSection page={first} q={null} onShowAll={onShowAll} />
        </QueryClientProvider>
    );

describe('ProfessorSection', () => {
    test('retorna nulo se lista de professores estiver vazia', () => {
        const html = renderSection(page([]));
        expect(html).toBe('');
    });

    test('renderiza título Docentes, contagem e cards', () => {
        const html = renderSection(
            page([professor, { ...professor, siape: 2, name: 'CARLOS SILVA' }])
        );

        expect(html).toContain('Docentes');
        expect(html).toContain('2 docentes encontrados');
        expect(html).toContain('Edson Alves da Silva');
        expect(html).toContain('Carlos Silva');
    });

    const list: ProfessorItem[] = Array.from({ length: 7 }, (_, i) => ({
        ...professor,
        siape: 1000 + i,
        name: `PROFESSOR ${i + 1}`
    }));

    test('mostra a página inteira e oferece a próxima quando o total é maior', () => {
        const html = renderSection(page(list, 30));
        expect(html).toContain('30 docentes encontrados');
        expect(html).toContain('Professor 7');
        expect(html).toContain('Ver mais docentes (23 restantes)');
    });

    test('prévia mostra cinco docentes e leva à aba de docentes', () => {
        const html = renderSection(page(list, 30), () => {});
        expect(html).toContain('Professor 5');
        expect(html).not.toContain('Professor 6');
        expect(html).toContain('Ver todos os docentes (30)');
        expect(html).not.toContain('Ver mais docentes');
    });

    test('conta pelo total da API, não pela página carregada', () => {
        const html = renderSection(page([professor], 42));
        expect(html).toContain('42 docentes encontrados');
    });
});
