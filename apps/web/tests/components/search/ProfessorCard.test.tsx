import { describe, expect, test } from 'bun:test';

import type { ProfessorItem } from '#/queries/professors';

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

describe('ProfessorSection', () => {
    test('retorna nulo se lista de professores estiver vazia', () => {
        const html = renderWithRouter(<ProfessorSection professors={[]} total={0} />);
        expect(html).toBe('');
    });

    test('renderiza título Docentes, contagem e cards', () => {
        const html = renderWithRouter(
            <ProfessorSection
                professors={[professor, { ...professor, siape: 2, name: 'CARLOS SILVA' }]}
                total={2}
            />
        );

        expect(html).toContain('Docentes');
        expect(html).toContain('2 docentes encontrados');
        expect(html).toContain('Edson Alves da Silva');
        expect(html).toContain('Carlos Silva');
    });

    test('exibe botão de ver mais quando há mais de 5 docentes', () => {
        const list: ProfessorItem[] = Array.from({ length: 7 }, (_, i) => ({
            ...professor,
            siape: 1000 + i,
            name: `PROFESSOR ${i + 1}`
        }));

        const html = renderWithRouter(<ProfessorSection professors={list} total={list.length} />);
        expect(html).toContain('Docentes');
        expect(html).toContain('7 docentes encontrados');
        expect(html).toContain('Ver mais docentes (2 restantes)');
    });

    test('conta pelo total da API, não pela página carregada', () => {
        const html = renderWithRouter(<ProfessorSection professors={[professor]} total={42} />);
        expect(html).toContain('42 docentes encontrados');
    });
});
