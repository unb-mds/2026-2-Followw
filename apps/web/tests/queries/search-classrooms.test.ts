import { describe, expect, test } from 'bun:test';

import {
    filterTurmas,
    isTurno,
    MOCK_TURMAS,
    searchClassroomsQueryOptions,
    type TurmaBusca
} from '#/queries/search-classrooms';

const SAMPLE_TURMAS: TurmaBusca[] = [
    {
        id: '1',
        codigo: 'FGA0108',
        turma: 'T01',
        nome: 'Matemática Discreta 2',
        horario: 'Ter · 16:00–17:50',
        local: 'FGA / Auditório',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '2',
        codigo: 'FGA0132',
        turma: 'T01',
        nome: 'Sistemas de Informação',
        horario: 'Qui · 14:00–15:50',
        local: 'FGA / Lab 3',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '3',
        codigo: 'FGA0099',
        turma: 'T01',
        nome: 'Probabilidade e Estatística',
        horario: 'Sex · 14:00–16:50',
        local: 'FGA / Sala 4',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: false
    },
    {
        id: '4',
        codigo: 'CIC0004',
        turma: 'T01',
        nome: 'Algoritmos e Programação',
        horario: 'Seg · 10:00–11:50',
        local: 'ICC / Sala AT-01',
        turno: 'Manhã',
        campus: 'Darcy Ribeiro',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '5',
        codigo: 'FGA0208',
        turma: 'T01',
        nome: 'Arquitetura de Software',
        horario: 'Ter · 14:00–15:50',
        local: 'FGA / Lab 2',
        turno: 'Tarde',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    }
];

describe('search-classrooms', () => {
    test('searchClassroomsQueryOptions retorna dados mockados', async () => {
        const options = searchClassroomsQueryOptions();
        expect(options.queryKey).toEqual(['search-classrooms']);
        const data = await options.queryFn?.({
            queryKey: options.queryKey,
            signal: new AbortController().signal,
            meta: undefined
        });
        expect(data).toEqual(MOCK_TURMAS);
    });

    test('isTurno valida corretamente os turnos válidos e inválidos', () => {
        expect(isTurno('Manhã')).toBe(true);
        expect(isTurno('Tarde')).toBe(true);
        expect(isTurno('Noite')).toBe(true);
        expect(isTurno('Madrugada')).toBe(false);
    });

    test('filtra turmas pelo semestre, campus e turno selecionados', () => {
        const result = filterTurmas(SAMPLE_TURMAS, {
            busca: '',
            semestre: '2027.2',
            campus: 'Gama',
            turno: 'Manhã'
        });

        expect(result.map((t) => t.id)).toEqual(['1', '2', '3']);
    });

    test('filtra pelo termo de busca no nome da disciplina', () => {
        const result = filterTurmas(SAMPLE_TURMAS, {
            busca: 'discreta',
            semestre: '2027.2',
            campus: 'Gama',
            turno: 'Manhã'
        });

        expect(result.map((t) => t.id)).toEqual(['1']);
    });

    test('filtra pelo código da disciplina sem diferenciar maiúsculas/minúsculas', () => {
        const result = filterTurmas(SAMPLE_TURMAS, {
            busca: 'fga0132',
            semestre: '2027.2',
            campus: 'Gama',
            turno: 'Manhã'
        });

        expect(result.map((t) => t.id)).toEqual(['2']);
    });

    test('filtra pelo local da turma', () => {
        const result = filterTurmas(SAMPLE_TURMAS, {
            busca: 'lab 3',
            semestre: '2027.2',
            campus: 'Gama',
            turno: 'Manhã'
        });

        expect(result.map((t) => t.id)).toEqual(['2']);
    });

    test('retorna lista vazia se nenhum resultado corresponder aos filtros', () => {
        const result = filterTurmas(SAMPLE_TURMAS, {
            busca: 'inexistente',
            semestre: '2027.2',
            campus: 'Gama',
            turno: 'Manhã'
        });

        expect(result).toEqual([]);
    });
});
