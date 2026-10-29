import {
    RouterContextProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';

import type { ProfessorDetails } from '#/queries/professors';

import { ProfessorDetailsSection } from '#/components/professor/ProfessorDetailsSection';

import { useDom } from '../../helpers/dom';
import { renderWithRouter } from '../../helpers/router';

const dom = useDom('http://localhost/professores/1234567');

function createTestRouter() {
    return createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory()
    });
}

const baseProfessor: ProfessorDetails = {
    siape: 1234567,
    name: 'EDSON ALVES DA SILVA',
    unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
    photo: null,
    url: 'https://sigaa.unb.br/perfil?siape=1234567',
    description: null,
    interests: null,
    lattes: null,
    email: null,
    education: [],
    disciplines: []
};

describe('ProfessorDetailsSection', () => {
    test('agrupa disciplinas por semestre em ordem decrescente e exibe nome e link de busca', () => {
        const professor: ProfessorDetails = {
            ...baseProfessor,
            disciplines: [
                {
                    semester: '2026.1',
                    code: 'FGA0108',
                    occurrences: 1,
                    name: null
                },
                {
                    semester: '2026.2',
                    code: 'FGA0003',
                    occurrences: 2,
                    name: 'COMPILADORES 1'
                }
            ]
        };

        const html = renderWithRouter(<ProfessorDetailsSection professor={professor} />);

        // Cabeçalhos de semestres
        expect(html).toContain('2026.2');
        expect(html).toContain('2026.1');

        // Ordem decrescente dos semestres no HTML
        const pos2026_2 = html.indexOf('2026.2');
        const pos2026_1 = html.indexOf('2026.1');
        expect(pos2026_2).toBeLessThan(pos2026_1);

        // Nome da matéria no lugar do código
        expect(html).toContain('COMPILADORES 1');
        expect(html).toContain('Matéria desconhecida');
        expect(html).not.toContain('>FGA0003<');

        // Badge de múltiplas turmas
        expect(html).toContain('2 turmas');

        // Links de busca
        expect(html).toContain('href="/buscar?q=FGA0003"');
        expect(html).toContain('href="/buscar?q=FGA0108"');
    });

    test('limita exibição a 6 semestres e expande ao clicar no botão', async () => {
        const semesters = [
            '2026.2',
            '2026.1',
            '2025.2',
            '2025.1',
            '2024.2',
            '2024.1',
            '2023.2',
            '2023.1'
        ];
        const professor: ProfessorDetails = {
            ...baseProfessor,
            disciplines: semesters.map((sem) => ({
                semester: sem,
                code: 'FGA0001',
                occurrences: 1,
                name: 'CÁLCULO 1'
            }))
        };

        const router = createTestRouter();
        const page = dom.testing.render(
            <RouterContextProvider router={router}>
                <ProfessorDetailsSection professor={professor} />
            </RouterContextProvider>
        );

        // Inicialmente mostra os primeiros 6 semestres
        expect(page.container.innerHTML).toContain('2026.2');
        expect(page.container.innerHTML).toContain('2024.1');
        expect(page.container.innerHTML).not.toContain('2023.2');
        expect(page.container.innerHTML).toContain('Ver mais semestres (2 restantes)');

        // Ao clicar no botão, expande todos os semestres
        const button = page.getByRole('button', { name: /Ver mais semestres/i });
        dom.testing.fireEvent.click(button);

        expect(page.container.innerHTML).toContain('2023.2');
        expect(page.container.innerHTML).toContain('2023.1');
        expect(page.container.innerHTML).toContain('Mostrar menos semestres');
    });
});
