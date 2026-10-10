import { queryOptions } from '@tanstack/react-query';

export type Turno = 'Manhã' | 'Tarde' | 'Noite';

export interface TurmaBusca {
    id: string;
    codigo: string;
    turma: string;
    nome: string;
    horario: string;
    local: string;
    turno: Turno;
    campus: string;
    semestre: string;
    disponivel: boolean;
}

export const SEMESTRES = ['2027.2', '2027.1', '2026.2'] as const;
export const CAMPI = ['Gama', 'Darcy Ribeiro', 'Planaltina', 'Ceilândia'] as const;
export const TURNOS: Turno[] = ['Manhã', 'Tarde', 'Noite'];

export const isTurno = (value: string): value is Turno =>
    (TURNOS as readonly string[]).includes(value);

// Dados mockados enquanto as rotas da API pública de turmas com filtros não estão prontas
export const MOCK_TURMAS: TurmaBusca[] = [
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
        codigo: 'FGA0156',
        turma: 'T01',
        nome: 'Banco de Dados',
        horario: 'Seg · 08:00–10:50',
        local: 'FGA / Lab 2',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '4',
        codigo: 'FGA0119',
        turma: 'T01',
        nome: 'Estruturas de Dados 2',
        horario: 'Qua · 10:00–11:50',
        local: 'FGA / Sala 1',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '5',
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
        id: '6',
        codigo: 'FGA0120',
        turma: 'T01',
        nome: 'Sistemas Operacionais',
        horario: 'Ter · 08:00–10:50',
        local: 'FGA / Lab 1',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: false
    },
    {
        id: '7',
        codigo: 'FGA0208',
        turma: 'T01',
        nome: 'Arquitetura de Software',
        horario: 'Ter · 14:00–15:50',
        local: 'FGA / Lab 2',
        turno: 'Tarde',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '8',
        codigo: 'FGA0242',
        turma: 'T01',
        nome: 'Testes de Software',
        horario: 'Sex · 19:00–21:50',
        local: 'FGA / Sala 3',
        turno: 'Noite',
        campus: 'Gama',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '9',
        codigo: 'CIC0004',
        turma: 'T01',
        nome: 'Algoritmos e Programação de Computadores',
        horario: 'Seg · 10:00–11:50',
        local: 'ICC / Sala AT-01',
        turno: 'Manhã',
        campus: 'Darcy Ribeiro',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '10',
        codigo: 'MAT0025',
        turma: 'T02',
        nome: 'Cálculo 1',
        horario: 'Ter · 14:00–15:50',
        local: 'PAT / Sala AT-03',
        turno: 'Tarde',
        campus: 'Darcy Ribeiro',
        semestre: '2027.2',
        disponivel: true
    },
    {
        id: '11',
        codigo: 'FGA0108',
        turma: 'T01',
        nome: 'Matemática Discreta 2',
        horario: 'Ter · 16:00–17:50',
        local: 'FGA / Sala 1',
        turno: 'Manhã',
        campus: 'Gama',
        semestre: '2027.1',
        disponivel: true
    }
];

export interface SearchTurmasFilters {
    busca: string;
    semestre: string;
    campus: string;
    turno: Turno;
}

export function filterTurmas(turmas: TurmaBusca[], filters: SearchTurmasFilters): TurmaBusca[] {
    const termo = filters.busca.trim().toLowerCase();

    return turmas.filter((item) => {
        if (
            item.semestre !== filters.semestre ||
            item.campus !== filters.campus ||
            item.turno !== filters.turno
        ) {
            return false;
        }
        if (!termo) return true;
        return (
            item.nome.toLowerCase().includes(termo) ||
            item.codigo.toLowerCase().includes(termo) ||
            item.local.toLowerCase().includes(termo)
        );
    });
}

export const searchClassroomsQueryOptions = () =>
    queryOptions({
        queryKey: ['search-classrooms'],
        queryFn: async (): Promise<TurmaBusca[]> => MOCK_TURMAS
    });
