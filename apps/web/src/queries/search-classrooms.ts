import { queryOptions } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type TurmaBusca = components['schemas']['CatalogClassroom'];
export type Turno = 'Todos' | 'Manhã' | 'Tarde' | 'Noite';
export const TURNOS: Turno[] = ['Todos', 'Manhã', 'Tarde', 'Noite'];
export const AVAILABILITIES = ['Todas', 'Disponíveis', 'Indisponíveis'] as const;
export type Availability = (typeof AVAILABILITIES)[number];
export const isAvailability = (value: string): value is Availability =>
    (AVAILABILITIES as readonly string[]).includes(value);
export const PAGE_SIZE = 40;

const SHIFTS = { Manhã: 'M', Tarde: 'T', Noite: 'N' } as const;

export const isTurno = (value: string): value is Turno =>
    (TURNOS as readonly string[]).includes(value);

export interface SearchTurmasFilters {
    busca?: string;
    semestre?: string;
    turno?: Turno;
    offset?: number;
    disponibilidade?: Availability;
}

export function searchClassroomsQueryOptions(
    filters: SearchTurmasFilters = {},
    registration: string | null = null
) {
    const path = registration ? '/me/classroom-catalog' : '/public/classrooms/catalog';
    const options = api.queryOptions('get', path, {
        params: {
            query: {
                q: filters.busca?.trim() || undefined,
                semester: filters.semestre || undefined,
                shift:
                    filters.turno && filters.turno !== 'Todos' ? SHIFTS[filters.turno] : undefined,
                availability:
                    filters.disponibilidade === 'Disponíveis'
                        ? 'available'
                        : filters.disponibilidade === 'Indisponíveis'
                          ? 'unavailable'
                          : undefined,
                offset: filters.offset ?? 0,
                limit: PAGE_SIZE
            }
        }
    });
    return queryOptions({
        ...options,
        queryKey: [...options.queryKey, registration] as const,
        queryFn: (context) => options.queryFn({ ...context, queryKey: options.queryKey })
    });
}

export function availableSeats(turma: TurmaBusca): number | null {
    if (turma.vacancies == null || turma.occupied == null) return null;
    return Math.max(0, turma.vacancies - turma.occupied);
}

export function lockedReasons(
    turma: TurmaBusca,
    prerequisitesMet: boolean | null = turma.prerequisites_met ?? null
): string[] {
    const reasons = [];
    if (availableSeats(turma) === 0) reasons.push('Turma cheia');
    if (prerequisitesMet === false) reasons.push('Pré-requisitos não atendidos');
    return reasons;
}
