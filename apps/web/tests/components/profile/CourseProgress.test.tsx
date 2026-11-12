import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Classroom } from '#/queries/classrooms';
import type { UserProfile } from '#/queries/me';

import { CourseProgress } from '#/components/profile/CourseProgress';

const user: UserProfile = {
    name: 'Discente',
    registration: '202600001',
    photo: null,
    bio: null,
    unit: null,
    course: null,
    entry_semester: null,
    integralization: 31,
    workload: {
        total: 3525,
        pending_mandatory: 1935,
        pending_optional: 480,
        pending_complementary: 0,
        mandatory: null,
        optional: null,
        complementary: null
    },
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

const text = (html: string) => html.replace(/<title>.*?<\/title>/g, '').replace(/<[^>]*>/g, '');

describe('CourseProgress', () => {
    test('zero por cento mantém o anel vazio sem ponto de progresso concluído', () => {
        const markup = renderToStaticMarkup(
            <CourseProgress user={{ ...user, integralization: 0 }} />
        );
        expect(markup).toContain('Integralização do curso: 0%');
        expect(markup).not.toContain('stroke="var(--primary)"');
    });
    test('exibe a previsão em outra cor sem acrescentar valores previstos ao texto', () => {
        const classrooms: Classroom[] = [
            {
                id: 'atual',
                number: '01',
                semester: '2026.2',
                current: true,
                subject: { code: 'MAT1000', name: 'Disciplina atual', hours: 60 },
                professors: []
            }
        ];
        const without = renderToStaticMarkup(<CourseProgress user={user} />);
        const markup = renderToStaticMarkup(<CourseProgress user={user} classrooms={classrooms} />);
        expect(markup).toContain('stroke="var(--primary-forecast)"');
        expect(markup).toContain('Previsto');
        expect(text(markup).replace('Previsto', '')).toBe(text(without));
    });
    test('mostra conclusão, total e pendências por categoria com gráfico acessível', () => {
        const markup = renderToStaticMarkup(<CourseProgress user={user} />);
        expect(markup).toContain('Integralização do curso: 31%');
        expect(markup).toContain('1.110h');
        expect(markup).toContain('3.525h');
        expect(markup).not.toContain('Faltam');
        expect(markup).toContain('1.935h pendentes');
        expect(markup).toContain('480h pendentes');
        expect(markup).not.toContain('Previsto');
        expect(markup).not.toContain('Não exigidas');
    });

    test('mostra concluído sobre o exigido com barra por categoria da matriz', () => {
        const markup = renderToStaticMarkup(
            <CourseProgress
                user={{
                    ...user,
                    workload: {
                        ...user.workload!,
                        mandatory: 2865,
                        optional: 660,
                        complementary: 0
                    }
                }}
            />
        );
        expect(text(markup)).toContain('930h / 2.865h');
        expect(text(markup)).toContain('180h / 660h');
        expect(text(markup)).toContain('Não exigido');
        expect(markup.match(/style="width:/g)).toHaveLength(2);
    });

    test('mantém a integralização sem estimar horas quando a carga está ausente', () => {
        const markup = renderToStaticMarkup(<CourseProgress user={{ ...user, workload: null }} />);
        expect(markup).toContain('31%');
        expect(markup).not.toContain('concluídas');
        expect(markup).not.toContain('Faltam');
        expect(markup).not.toContain('Obrigatórias');
    });

    test('mostra as horas sem inventar percentual quando não há integralização', () => {
        const markup = renderToStaticMarkup(
            <CourseProgress user={{ ...user, integralization: null }} />
        );
        expect(markup).toContain('1.110h');
        expect(markup).not.toContain('<svg');
        expect(markup).not.toContain('role="img"');
    });

    test('preserva as pendências sem exibir horas concluídas negativas', () => {
        const markup = renderToStaticMarkup(
            <CourseProgress user={{ ...user, workload: { ...user.workload!, total: 100 } }} />
        );
        expect(markup).toContain('Total do currículo');
        expect(markup).toContain('100h');
        expect(markup).not.toContain('concluídas');
        expect(markup).not.toContain('Faltam');
    });
});
