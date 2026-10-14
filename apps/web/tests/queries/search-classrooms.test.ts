import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { components } from '#/queries/schema.gen';

import { clearSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import {
    availableSeats,
    isAvailability,
    isTurno,
    lockedReasons,
    PAGE_SIZE,
    searchClassroomsQueryOptions,
    type TurmaBusca
} from '#/queries/search-classrooms';

const turma: TurmaBusca = {
    id: 'turma-1',
    subject: { code: 'FGA0001', name: 'CÁLCULO', unity: 'FCTE' },
    number: '01',
    semester: '2026.2',
    schedule: '35M12',
    room: 'S3',
    prerequisites: null,
    professors: ['ANA'],
    vacancies: 50,
    occupied: 48
};
const catalog: components['schemas']['ClassroomCatalog'] = {
    semesters: ['2026.2'],
    semester: '2026.2',
    total: 1,
    classrooms: [turma]
};

describe('catálogo público de turmas', () => {
    let middleware: Middleware;
    let client: QueryClient;
    let requests: Request[];
    let response: () => Response;

    beforeEach(() => {
        requests = [];
        response = () => Response.json(catalog);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return response();
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });
    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
    });

    test('busca dados reais pelo endpoint público sem inventar semestre', async () => {
        expect(await client.query(searchClassroomsQueryOptions())).toEqual(catalog);
        const url = new URL(requests[0].url);
        expect(url.pathname).toBe('/api/public/classrooms/catalog');
        expect(url.searchParams.has('semester')).toBe(false);
        expect(url.searchParams.has('shift')).toBe(false);
        expect(url.searchParams.get('limit')).toBe(String(PAGE_SIZE));
    });

    test('envia disponibilidade à API e não restringe a opção Todas', async () => {
        await Promise.all(
            (['Todas', 'Disponíveis', 'Indisponíveis'] as const).map((label) =>
                client.query(searchClassroomsQueryOptions({ disponibilidade: label }))
            )
        );
        expect(
            new Set(
                requests.map((request) => new URL(request.url).searchParams.get('availability'))
            )
        ).toEqual(new Set([null, 'available', 'unavailable']));
        expect(isAvailability('Todas')).toBe(true);
        expect(isAvailability('Disponíveis')).toBe(true);
        expect(isAvailability('Indisponíveis')).toBe(true);
        expect(isAvailability('Outro')).toBe(false);
    });

    test('conta autenticada usa catálogo pessoal com chave por matrícula', async () => {
        const options = searchClassroomsQueryOptions(
            { disponibilidade: 'Indisponíveis' },
            '251000000'
        );
        expect(await client.query(options)).toEqual(catalog);
        expect(new URL(requests[0].url).pathname).toBe('/api/me/classroom-catalog');
        expect(options.queryKey).not.toEqual(
            searchClassroomsQueryOptions({ disponibilidade: 'Indisponíveis' }, '251000001').queryKey
        );
        await clearSession(client);
        expect(client.getQueryData(options.queryKey)).toBeUndefined();
    });

    test('cadeado considera a avaliação enviada no catálogo pessoal', () => {
        expect(lockedReasons({ ...turma, prerequisites_met: false })).toEqual([
            'Pré-requisitos não atendidos'
        ]);
        expect(lockedReasons({ ...turma, occupied: 50, prerequisites_met: false })).toEqual([
            'Turma cheia',
            'Pré-requisitos não atendidos'
        ]);
        expect(lockedReasons({ ...turma, prerequisites_met: null })).toEqual([]);
    });

    test('envia busca, semestre, turno e paginação à API', async () => {
        await client.query(
            searchClassroomsQueryOptions({
                busca: '  cálculo  ',
                semestre: '2026.2',
                turno: 'Tarde',
                offset: 40
            })
        );
        expect(Object.fromEntries(new URL(requests[0].url).searchParams)).toEqual({
            q: 'cálculo',
            semester: '2026.2',
            shift: 'T',
            offset: '40',
            limit: '40'
        });
    });

    test('cache separa busca, turno, semestre e página', () => {
        const first = searchClassroomsQueryOptions().queryKey;
        for (const filters of [
            { busca: 'FGA' },
            { semestre: '2026.1' },
            { turno: 'Manhã' as const },
            { offset: 40 },
            { disponibilidade: 'Indisponíveis' as const }
        ]) {
            expect(searchClassroomsQueryOptions(filters).queryKey).not.toEqual(first);
        }
    });

    test('todos os turnos e busca em branco não restringem a consulta', async () => {
        await client.query(searchClassroomsQueryOptions({ turno: 'Todos', busca: '   ' }));
        const params = new URL(requests[0].url).searchParams;
        expect(params.has('shift')).toBe(false);
        expect(params.has('q')).toBe(false);
    });

    test('propaga falha da API em vez de retornar mocks ou lista vazia', async () => {
        response = () => Response.json({ detail: 'Indisponível' }, { status: 503 });
        const error = await client
            .query(searchClassroomsQueryOptions())
            .catch((failure: unknown) => failure);
        expect(error).toEqual({ detail: 'Indisponível' });
    });

    test('aceita todos e apenas turnos válidos', () => {
        for (const turno of ['Todos', 'Manhã', 'Tarde', 'Noite']) expect(isTurno(turno)).toBe(true);
        expect(isTurno('Madrugada')).toBe(false);
    });

    test('vagas restantes distinguem turma cheia de informação ausente', () => {
        expect(availableSeats(turma)).toBe(2);
        expect(availableSeats({ ...turma, occupied: 50 })).toBe(0);
        expect(availableSeats({ ...turma, occupied: 60 })).toBe(0);
        expect(availableSeats({ ...turma, vacancies: null })).toBeNull();
        expect(availableSeats({ ...turma, occupied: null })).toBeNull();
    });
});
