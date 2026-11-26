import type { components } from './schema.gen.ts';
import type { SubjectClassroom } from './subjects.ts';

import { api } from './api.ts';

export type StatisticsShare = components['schemas']['StatisticsShare'];
export type StatisticsSituation = StatisticsShare['situation'];

export const situationLabels: Record<StatisticsSituation, string> = {
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    reprovado_por_faltas: 'Reprovado por faltas',
    reprovado_por_media_e_por_faltas: 'Reprovado por média e faltas',
    aprovado_por_nota: 'Aprovado por nota',
    reprovado_por_nota: 'Reprovado por nota',
    reprovado_por_nota_e_faltas: 'Reprovado por nota e faltas',
    trancado: 'Trancado',
    matriculado: 'Matriculado'
};

const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const shareLabel = (value: number) => `${percentage.format(value)}%`;

export const subjectStatisticsQueryOptions = (code: string, classroom: SubjectClassroom) =>
    api.queryOptions('get', '/public/subjects/{code}/statistics', {
        params: {
            path: { code },
            query: { semester: classroom.semester, number: classroom.number }
        }
    });
